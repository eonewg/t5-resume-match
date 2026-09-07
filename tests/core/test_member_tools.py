import sys
import types

import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.core.providers import load_provider, provider_class
from backend.main import create_app
from examples.fixtures import load_cases
from scripts.check_member import CheckFailure, ci_roles, module_tests_exist, probe
from scripts.check_scope import allowed_path, violations
from scripts.member_specs import MEMBERS


@pytest.mark.parametrize("role", MEMBERS)
def test_runnable_examples(role):
    result = probe(role, MEMBERS[role].example, examples=True)
    assert result.startswith("EXAMPLE_CHECK_PASS")
    with pytest.raises(CheckFailure, match="示例入口"):
        probe(role, MEMBERS[role].example)


def test_examples_stay_mock_in_real_http_pipeline():
    settings = Settings(
        _env_file=None,
        database_url="sqlite:///:memory:",
        **{f"{spec.key}_provider": spec.example for spec in MEMBERS.values()},
    )
    sample = load_cases()
    with TestClient(create_app(settings)) as client:
        assert client.get("/ready").status_code == 503
        assert all(p["is_mock"] for p in client.get("/api/v1/modules").json().values())
        resume = client.post(
            "/api/v1/resumes/parse", json={"raw_text": sample["resume"]["raw_text"]}
        ).json()
        jd = client.post(
            "/api/v1/jobs",
            json={
                key: value
                for key, value in sample["jobs"][0].items()
                if key not in ("id", "skills")
            },
        ).json()
        result = client.post(
            "/api/v1/workflow", json={"resume_id": resume["id"], "jd_id": jd["id"]}
        )
        assert result.status_code == 201
        assert result.json()["match"]["is_mock"] is True
        assert result.json()["diagnosis"]["is_mock"] is True


def module_with(monkeypatch, cls):
    module = types.ModuleType("temporary_provider")
    module.Service = cls
    monkeypatch.setitem(sys.modules, module.__name__, module)
    return "temporary_provider:Service"


def test_async_provider_rejected_at_startup(monkeypatch):
    class AsyncService:
        async def parse(self, data):
            return data

    with pytest.raises(TypeError, match="synchronous"):
        provider_class("resume", module_with(monkeypatch, AsyncService))


def test_wrong_signature_rejected(monkeypatch):
    class WrongService:
        def parse(self):
            pass

    with pytest.raises(TypeError):
        provider_class("resume", module_with(monkeypatch, WrongService))


def test_invalid_mock_marker_rejected(monkeypatch):
    class WrongMarker:
        is_mock = "false"

        def parse(self, data):
            return data

    with pytest.raises(TypeError, match="boolean"):
        load_provider("resume", module_with(monkeypatch, WrongMarker))


def test_d_offline_probe_never_constructs_or_calls_service(monkeypatch):
    class PaidService:
        def __init__(self):
            raise AssertionError("Do not initialize the paid client")

        def diagnose(self, data):
            raise AssertionError("Do not call the paid client")

    assert probe("D", module_with(monkeypatch, PaidService)).startswith("OFFLINE")


def test_ci_requires_target_member_even_when_missing(tmp_path):
    assert ci_roles("feat/resume-b", tmp_path) == ["B"]
    assert ci_roles("feat/core-a", tmp_path) == []
    with pytest.raises(CheckFailure, match="缺少"):
        module_tests_exist("B", tmp_path)
    with pytest.raises(CheckFailure, match="未知成员分支"):
        ci_roles("feat/typo", tmp_path)


def test_scope_rejects_cross_module_and_root_changes():
    assert allowed_path("B", "backend/modules/resume/public.py")
    assert allowed_path("E", "tests/quality/test_workflow.py")
    assert not allowed_path("C", "backend/modules/resume/public.py")
    assert not allowed_path("D", "pyproject.toml")
    assert not allowed_path("B", "docs/integration_requests/C-example.md")
    assert violations("B", ["backend/modules/resume/.env"])
