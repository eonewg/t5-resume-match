"""Settings tests use temporary files and synthetic keys; no real provider calls."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.core import ai_settings
from backend.core.config import Settings
from backend.main import create_app
from backend.modules.jobs import assessment
from backend.modules.jobs.assessment import transport as matching_transport
from backend.modules.resume import ai


@pytest.fixture
def config(tmp_path, monkeypatch):
    for key, value in {
        "T5_RESUME_LLM_VENDOR": "custom",
        "T5_RESUME_LLM_BASE_URL": "https://startup.example.test/v1",
        "T5_RESUME_LLM_MODEL": "startup-model",
        "T5_RESUME_LLM_API_KEY": "synthetic-startup-key",
        "T5_RESUME_API_STYLE": "chat_completions",
        "T5_DIAGNOSIS_LLM_VENDOR": "custom",
        "T5_DIAGNOSIS_BASE_URL": "https://startup.example.test/v1",
        "T5_DIAGNOSIS_MODEL": "startup-model",
        "T5_DIAGNOSIS_API_STYLE": "openai_chat",
        "T5_DIAGNOSIS_API_KEY": "synthetic-startup-key",
        "T5_MATCHING_BASE_URL": "https://startup.example.test/v1",
        "T5_MATCHING_MODEL": "startup-model",
        "T5_MATCHING_API_KEY": "synthetic-startup-key",
    }.items():
        monkeypatch.setenv(key, value)
    return Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        ai_settings_file=tmp_path / "ai-settings.json",
    )


def change(client, **kwargs):
    return {
        "revision": client.get("/api/v1/settings/ai").json()["revision"],
        "modules": ["resume", "matching", "diagnosis"],
        "base_url": "https://custom.example.test/v1",
        "model": "synthetic-model",
        "api_key": "synthetic-new-key",
        "api_style": "chat_completions",
        **kwargs,
    }


def test_masked_atomic_persistence_restore_and_no_background_call(config, monkeypatch):
    calls = []
    monkeypatch.setattr(ai_settings, "test_connection", lambda *_: calls.append("probe"))
    with TestClient(create_app(config)) as client:
        before = client.get("/api/v1/settings/ai")
        assert before.headers["cache-control"] == "no-store"
        assert "synthetic-startup-key" not in before.text
        assert all(row["api_key_configured"] for row in before.json()["modules"].values())
        previous = client.app.state.providers
        response = client.put("/api/v1/settings/ai", json=change(client))
        assert response.status_code == 200, response.text
        assert "synthetic-new-key" not in response.text and not calls
        active = client.app.state.providers
        assert previous is not active
        assert previous["diagnosis"].service.settings.model == "startup-model"
        assert active["resume"].service.settings.llm_model == "synthetic-model"
        assert (
            active["jobs"].service.assessment_settings.endpoint
            == "https://custom.example.test/v1/chat/completions"
        )
        assert (
            active["diagnosis"].service.client.settings.endpoint
            == "https://custom.example.test/v1/chat/completions"
        )
        assert all(not value.is_mock for value in active.values())
        disk = json.loads(config.ai_settings_file.read_text(encoding="utf-8"))
        assert (
            disk["profiles"][disk["assignments"]["resume"]]["config"]["api_key"]
            == "synthetic-new-key"
        )
        assert client.get("/api/v1/settings/ai").json()["modules"]["resume"]["source"] == "custom"
    with TestClient(create_app(config)) as client:
        assert client.app.state.providers["resume"].service.settings.llm_model == "synthetic-model"
        data = change(client)
        result = client.post(
            "/api/v1/settings/ai/reset", json={key: data[key] for key in ("modules", "revision")}
        )
        assert result.status_code == 200
        assert client.app.state.providers["diagnosis"].service.settings.model == "startup-model"
        assert json.loads(config.ai_settings_file.read_text(encoding="utf-8"))["assignments"] == {}
    assert not calls


def test_empty_key_reuses_only_same_address_and_conflicts_do_not_overwrite(config, monkeypatch):
    with TestClient(create_app(config)) as client:
        data = change(client, api_key=None, base_url="https://startup.example.test/v1")
        assert client.put("/api/v1/settings/ai", json=data).status_code == 200
        assert (
            client.app.state.providers["resume"].service.settings.llm_api_key.get_secret_value()
            == "synthetic-startup-key"
        )
        assert client.put("/api/v1/settings/ai", json=data).status_code == 409
        old = config.ai_settings_file.read_bytes()
        assert (
            client.put("/api/v1/settings/ai", json=change(client, api_key=None)).status_code == 422
        )
        assert config.ai_settings_file.read_bytes() == old
        providers = client.app.state.providers
        monkeypatch.setattr(
            ai_settings.os, "replace", lambda *_: (_ for _ in ()).throw(OSError("private path"))
        )
        failed = client.put("/api/v1/settings/ai", json=change(client))
        assert failed.status_code == 503 and "private path" not in failed.text
        assert (
            providers is client.app.state.providers and config.ai_settings_file.read_bytes() == old
        )


def test_invalid_origin_address_and_protocol_never_change_config(config):
    with TestClient(create_app(config)) as client:
        for headers in [
            {"origin": "https://other.test"},
            {"sec-fetch-site": "cross-site"},
            {"host": "attacker.test"},
        ]:
            assert (
                client.put("/api/v1/settings/ai", json=change(client), headers=headers).status_code
                == 403
            )
        for address in [
            "http://external.test",
            "https://user:secret@host.test",
            "https://host.test?api_key=private",
            "https://host.test/#fragment",
        ]:
            result = client.put("/api/v1/settings/ai", json=change(client, base_url=address))
            assert (
                result.status_code == 422
                and "private" not in result.text
                and "synthetic-new-key" not in result.text
            )
        assert (
            client.put(
                "/api/v1/settings/ai", json=change(client, api_style="responses")
            ).status_code
            == 422
        )
        assert (
            client.put(
                "/api/v1/settings/ai", json=change(client, base_url="https://host.test/responses")
            ).status_code
            == 422
        )
        assert not config.ai_settings_file.exists()


def test_runtime_resume_request_uses_saved_endpoint_model_and_key(config, monkeypatch):
    captured = []

    def send(endpoint, payload, headers, timeout):
        captured.append((endpoint, payload["model"], headers["Authorization"]))
        return json.dumps(
            {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(
                                {
                                    "name": None,
                                    "education": "",
                                    "skills": ["Python"],
                                    "experience": [],
                                }
                            ),
                        },
                    }
                ]
            }
        ).encode()

    monkeypatch.setattr(ai, "transport", send)
    with TestClient(create_app(config)) as client:
        assert (
            client.put("/api/v1/settings/ai", json=change(client, modules=["resume"])).status_code
            == 200
        )
        response = client.post(
            "/api/v1/resumes/preview", json={"raw_text": "Synthetic fixture. Python."}
        )
        assert response.status_code == 200, response.text
        assert response.json()["skills"] == ["Python"]
        assert captured == [
            (
                "https://custom.example.test/v1/chat/completions",
                "synthetic-model",
                "Bearer synthetic-new-key",
            )
        ]


@pytest.mark.parametrize(
    "status,finish,expected",
    [
        (200, "stop", 200),
        (200, "length", 502),
        (200, "content_filter", 502),
        (401, "stop", 422),
        (429, "stop", 429),
        (302, "stop", 502),
    ],
)
def test_explicit_connection_probe_is_bounded_masked_and_does_not_save(
    config, monkeypatch, status, finish, expected
):
    original = httpx.Client
    calls = []

    def reply(request):
        calls.append(request)
        return httpx.Response(
            status,
            json={
                "choices": [
                    {"finish_reason": finish, "message": {"content": "PRIVATE_UPSTREAM_TEXT"}}
                ]
            },
        )

    # Create TestClient before replacing the shared httpx.Client symbol.
    with TestClient(create_app(config)) as client:
        monkeypatch.setattr(
            ai_settings.httpx,
            "Client",
            lambda **kwargs: original(transport=httpx.MockTransport(reply), **kwargs),
        )
        before = client.app.state.providers
        result = client.post("/api/v1/settings/ai/test", json=change(client, modules=["resume"]))
        assert result.status_code == expected, result.text
        assert "PRIVATE_UPSTREAM_TEXT" not in result.text and "synthetic-new-key" not in result.text
        assert not config.ai_settings_file.exists() and client.app.state.providers is before
        assert len(calls) == 1 and "Synthetic fixture" not in calls[0].content.decode()
        assert calls[0].headers["Authorization"] == "Bearer synthetic-new-key"


def test_corrupt_file_preserved_and_reported(config):
    config.ai_settings_file.write_text("{bad json")
    with TestClient(create_app(config)) as client:
        result = client.get("/api/v1/settings/ai").json()
        assert result["warning"] and result["modules"]["resume"]["source"] == "startup"
        assert config.ai_settings_file.read_text(encoding="utf-8") == "{bad json"


def test_matching_transport_receives_configured_url_and_key(monkeypatch):
    captured = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def read(self, _):
            return b"{}"

    class Opener:
        def open(self, request, timeout):
            captured.append(
                (
                    request.full_url,
                    request.get_header("Authorization"),
                    json.loads(request.data)["model"],
                )
            )
            return Response()

    monkeypatch.setattr(assessment, "build_opener", lambda *_: Opener())
    matching_transport(
        {"model": "synthetic-model"},
        "synthetic-key",
        10,
        endpoint="https://custom.example.test/v1/chat/completions",
    )
    assert captured == [
        (
            "https://custom.example.test/v1/chat/completions",
            "Bearer synthetic-key",
            "synthetic-model",
        )
    ]


def test_multiple_profiles_switch_independently_reveal_and_delete(config):
    with TestClient(create_app(config)) as client:
        first = client.put(
            "/api/v1/settings/ai", json=change(client, profile_name="Supplier A")
        ).json()
        a = first["saved_profile_id"]
        second = client.put(
            "/api/v1/settings/ai",
            json=change(
                client,
                modules=[],
                profile_name="Supplier B",
                model="model-b",
                api_key="synthetic-b-key",
            ),
        ).json()
        b = second["saved_profile_id"]
        assert len(second["profiles"]) == 2
        assert all(value["profile_id"] == a for value in second["modules"].values())
        switched = client.post(
            "/api/v1/settings/ai/activate",
            json={"revision": second["revision"], "profile_id": b, "modules": ["resume"]},
        ).json()
        assert switched["modules"]["resume"]["profile_id"] == b
        assert switched["modules"]["matching"]["profile_id"] == a
        assert client.app.state.providers["resume"].service.settings.llm_model == "model-b"
        assert (
            client.app.state.providers["jobs"].service.assessment_settings.model
            == "synthetic-model"
        )
        show = client.post(
            "/api/v1/settings/ai/key",
            json={"revision": switched["revision"], "module": "resume", "profile_id": b},
        )
        assert (
            show.json()["api_key"] == "synthetic-b-key"
            and show.headers["cache-control"] == "no-store"
        )
        assert "synthetic-b-key" not in client.get("/api/v1/settings/ai").text
        assert (
            client.post(
                "/api/v1/settings/ai/profiles/delete",
                json={"revision": switched["revision"], "profile_id": a},
            ).status_code
            == 409
        )
        reset = client.post(
            "/api/v1/settings/ai/reset",
            json={"revision": switched["revision"], "modules": ["matching", "diagnosis"]},
        ).json()
        deleted = client.post(
            "/api/v1/settings/ai/profiles/delete",
            json={"revision": reset["revision"], "profile_id": a},
        ).json()
        assert [entry["id"] for entry in deleted["profiles"]] == [b]
        manager = client.app.state.ai_settings
    assert manager.profiles == {} and manager.base_values == {}
    with TestClient(create_app(config)) as client:
        assert client.get("/api/v1/settings/ai").json()["modules"]["resume"]["profile_id"] == b


def test_save_exit_persists_before_shutdown_and_write_failure_keeps_running(config, monkeypatch):
    calls = []
    config.allow_app_exit = True

    def stopped():
        stored = json.loads(config.ai_settings_file.read_text(encoding="utf-8"))
        calls.append(stored["profiles"][stored["assignments"]["resume"]]["config"]["model"])

    with TestClient(create_app(config, shutdown_callback=stopped)) as client:
        update = change(client, modules=["resume"])
        original = ai_settings.os.replace
        monkeypatch.setattr(
            ai_settings.os, "replace", lambda *_: (_ for _ in ()).throw(OSError("fixture"))
        )
        failed = client.post(
            "/api/v1/settings/ai/save-exit", json={"revision": update["revision"], "update": update}
        )
        assert failed.status_code == 503 and not calls and not client.app.state.exiting
        monkeypatch.setattr(ai_settings.os, "replace", original)
        response = client.post(
            "/api/v1/settings/ai/save-exit", json={"revision": update["revision"], "update": update}
        )
        assert response.status_code == 200 and response.json()["exiting"]
        assert calls == ["synthetic-model"]
        assert client.app.state.exiting
        assert (
            client.post(
                "/api/v1/settings/ai/save-exit", json={"revision": update["revision"]}
            ).status_code
            == 409
        )
    assert config.ai_settings_file.exists()


def test_non_desktop_instance_cannot_exit(config):
    with TestClient(create_app(config)) as client:
        revision = client.get("/api/v1/settings/ai").json()["revision"]
        assert (
            client.post("/api/v1/settings/ai/save-exit", json={"revision": revision}).status_code
            == 409
        )
