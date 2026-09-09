"""AI-first API behavior with a real ResumeAIService and entirely offline transport."""

import json
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app
from backend.modules.resume.ai import ResumeAIService
from backend.modules.resume.config import ResumeSettings
from backend.modules.resume.public import ResumeService

RAW = "  姓名：测试同学\r\n学历：本科\r\n技能：Python、SQL\r\n项目经历：整理 30 条课程数据。\n "
FACTS = {
    "name": "测试同学",
    "education": "本科",
    "skills": ["Python", "SQL"],
    "experience": ["整理 30 条课程数据。"],
}


def envelope(facts=None, content=None):
    content = json.dumps(FACTS if facts is None else facts) if content is None else content
    return json.dumps(
        {"choices": [{"finish_reason": "stop", "message": {"content": content}}]}
    ).encode()


@pytest.fixture
def setup(tmp_path):
    app = create_app(Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'ai-api.db'}"))
    with TestClient(app) as client:
        provider = app.state.providers["resume"]
        assert type(provider.service) is ResumeService
        assert isinstance(provider.service, ResumeAIService)
        assert provider.is_mock is False
        provider.service.settings = ResumeSettings(
            _env_file=None,
            llm_model="offline-test",
            llm_api_key="sensitive-test-key",
            llm_base_url="https://sensitive-endpoint.invalid/v1",
        )
        # Every test must provide an explicit fake transport; network is never available here.
        provider.service.transport = lambda *args: pytest.fail("unexpected AI call")
        yield client, provider.service


def send_upload(client, body=None, name="resume.txt", mime="text/plain"):
    return client.post(
        "/api/v1/resumes/upload-preview",
        files={"file": (name, RAW.encode() if body is None else body, mime)},
    )


def test_default_provider_success_is_ai_and_has_no_persistence(setup):
    client, service = setup
    calls = []

    def send(endpoint, payload, headers, timeout):
        calls.append(payload["messages"][1]["content"])
        # Rules would include SQL; AI's supported subset makes its actual use observable.
        return envelope({**FACTS, "skills": ["Python"]})

    service.transport = send
    result = client.post("/api/v1/resumes/preview", json={"raw_text": RAW})
    assert result.status_code == 200
    assert result.json() == {**FACTS, "skills": ["Python"], "raw_text": RAW}
    assert result.headers["x-t5-mock"] == "false"
    assert calls == [RAW]
    assert client.get("/api/v1/resumes").json() == []


@pytest.mark.parametrize("path", ["preview", "parse"])
def test_ai_failure_never_returns_rules_or_creates_a_record(setup, path):
    client, service = setup
    calls = []

    def send(*args):
        calls.append(1)
        raise TimeoutError("sensitive-upstream-body")

    service.transport = send
    result = client.post(f"/api/v1/resumes/{path}", json={"raw_text": RAW})
    assert result.status_code == 504
    assert result.json()["error"]["message"]["code"] == "timeout"
    assert "skills" not in result.json()
    assert len(calls) == 1
    assert client.get("/api/v1/resumes").json() == []


@pytest.mark.parametrize(
    "kind,status",
    [
        ("timeout", 504),
        ("rate_limit", 503),
        ("upstream", 502),
        ("auth", 502),
        ("forbidden", 502),
        ("json", 502),
        ("schema", 502),
        ("guard", 502),
        ("network", 502),
    ],
)
def test_upload_ai_errors_retain_source_but_hide_transport_secrets(setup, kind, status, caplog):
    client, service = setup
    calls = []

    def send(*args):
        calls.append(1)
        http = {"rate_limit": 429, "upstream": 500, "auth": 401, "forbidden": 403}
        if kind in http:
            raise HTTPError(
                "https://sensitive-endpoint.invalid",
                http[kind],
                "sensitive-upstream-body",
                {},
                None,
            )
        if kind == "timeout":
            raise TimeoutError("sensitive-upstream-body")
        if kind == "network":
            raise RuntimeError("sensitive-upstream-body")
        if kind == "json":
            return b"sensitive-upstream-body"
        if kind == "schema":
            return envelope({**FACTS, "raw_text": "sensitive-upstream-body"})
        return envelope({**FACTS, "experience": ["整理 999999 条课程数据。"]})

    service.transport = send
    result = send_upload(client)
    assert result.status_code == status
    detail = result.json()["error"]["message"]
    assert detail["raw_text"] == RAW
    assert detail["code"] == ("auth" if kind == "forbidden" else kind)
    assert len(calls) == 1
    for secret in [
        "sensitive-test-key",
        "sensitive-endpoint",
        "sensitive-upstream-body",
        "Authorization",
        "Traceback",
    ]:
        assert secret not in result.text
        assert secret not in caplog.text
    assert RAW not in caplog.text
    assert client.get("/api/v1/resumes").json() == []


@pytest.mark.parametrize("disabled", [False, True])
def test_upload_configuration_failure_also_keeps_extracted_source(setup, disabled):
    client, service = setup
    service.settings = ResumeSettings(_env_file=None, ai_enabled=not disabled)
    response = send_upload(client)
    assert response.status_code == 503
    assert response.json()["error"]["message"]["raw_text"] == RAW
    assert response.json()["error"]["message"]["code"] == ("disabled" if disabled else "config")


@pytest.mark.parametrize(
    "body,name,mime,status",
    [
        (b"", "empty.txt", "text/plain", 422),
        (b"bad", "resume.exe", "application/octet-stream", 415),
        (
            b"bad",
            "resume.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            422,
        ),
        (b"bad", "resume.pdf", "application/pdf", 422),
    ],
)
def test_extraction_failure_never_calls_ai(setup, body, name, mime, status):
    client, _ = setup
    response = send_upload(client, body, name, mime)
    assert response.status_code == status
    assert client.get("/api/v1/resumes").json() == []


def test_user_retry_is_one_new_call_and_existing_confirmed_record_is_untouched(setup):
    client, service = setup
    saved = client.post(
        "/api/v1/resumes", json={**FACTS, "name": "已确认姓名", "raw_text": RAW}
    ).json()
    calls = []

    def send(*args):
        calls.append(1)
        if len(calls) == 1:
            raise TimeoutError()
        return envelope()

    service.transport = send
    failed = send_upload(client)
    assert failed.status_code == 504
    assert len(calls) == 1
    succeeded = client.post(
        "/api/v1/resumes/preview", json={"raw_text": failed.json()["error"]["message"]["raw_text"]}
    )
    assert succeeded.status_code == 200
    assert succeeded.json() == {**FACTS, "raw_text": RAW}
    assert len(calls) == 2
    assert client.get("/api/v1/resumes").json() == [saved]


def test_manual_save_after_ai_failure_retains_source_and_can_match(setup):
    client, service = setup
    service.transport = lambda *args: b"invalid"
    failed = send_upload(client)
    assert failed.status_code == 502
    confirmed = {
        **FACTS,
        "skills": ["SQL"],
        "raw_text": failed.json()["error"]["message"]["raw_text"],
    }
    saved = client.post("/api/v1/resumes", json=confirmed)
    assert saved.status_code == 201
    identifier = saved.json()["id"]
    assert client.get(f"/api/v1/resumes/{identifier}").json() == {**confirmed, "id": identifier}
    jd = client.post("/api/v1/jobs", json={"title": "课程数据岗位", "jd_text": "技能要求：SQL"})
    assert jd.status_code == 201
    matched = client.post(
        "/api/v1/matches", json={"resume_id": identifier, "jd_id": jd.json()["id"]}
    )
    assert matched.status_code == 201
    assert matched.json()["matched_skills"] == ["SQL"]


def test_empty_ai_fields_are_a_valid_draft_with_verbatim_source(setup):
    client, service = setup
    facts = {"name": None, "education": "", "skills": [], "experience": []}
    service.transport = lambda *args: envelope(facts)
    result = client.post("/api/v1/resumes/preview", json={"raw_text": "  暂无个人信息。\n"})
    assert result.status_code == 200
    assert result.json() == {**facts, "raw_text": "  暂无个人信息。\n"}
