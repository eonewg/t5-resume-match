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
from scripts.member_specs import MODULES


@pytest.mark.parametrize("role", MODULES)
def test_runnable_examples(role):
    result = probe(role, MODULES[role].example, examples=True)
    assert result.startswith("EXAMPLE_CHECK_PASS")
    with pytest.raises(CheckFailure, match="示例入口"):
        probe(role, MODULES[role].example)


def test_examples_stay_mock_in_real_http_pipeline():
    settings = Settings(
        _env_file=None,
        database_url="sqlite:///:memory:",
        **{f"{spec.key}_provider": spec.example for spec in MODULES.values()},
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
        analytics = client.get("/api/v1/analytics")
        assert analytics.status_code == 200
        assert analytics.json()["is_mock"] is True
        # New arbitrary text should stay explicitly Mock, not break the demo pipeline.
        other = client.post("/api/v1/resumes/parse", json={"raw_text": "Unstructured demo"}).json()
        pair = client.post("/api/v1/workflow", json={"resume_id": other["id"], "jd_id": jd["id"]})
        assert pair.status_code == 201
        assert pair.json()["match"]["is_mock"] is True


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

    assert probe("diagnosis", module_with(monkeypatch, PaidService)).startswith("OFFLINE")


def test_ci_requires_target_member_even_when_missing(tmp_path):
    assert ci_roles("feat/intelligence-d", tmp_path) == ["jobs", "diagnosis"]
    assert ci_roles("feat/core-a", tmp_path) == []
    with pytest.raises(CheckFailure, match="缺少"):
        module_tests_exist("resume", tmp_path)
    with pytest.raises(CheckFailure, match="未知成员分支"):
        ci_roles("feat/typo", tmp_path)


def test_scope_rejects_cross_module_and_root_changes():
    assert allowed_path("D", "backend/modules/jobs/public.py")
    assert allowed_path("D", "frontend/src/modules/diagnosis/index.js")
    assert allowed_path("D", "tests/jobs/test_match.py")
    assert allowed_path("D", "docs/integration_requests/D-vector.md")
    assert not allowed_path("D", "backend/modules/resume/public.py")
    assert not allowed_path("D", "tests/quality/test_workflow.py")
    assert not allowed_path("D", "pyproject.toml")
    assert not allowed_path("D", "docs/integration_requests/A-example.md")
    assert violations("D", ["backend/modules/jobs/.env"])


@pytest.mark.parametrize(
    "branch", ["feat/resume-b", "feat/matching-c", "feat/diagnosis-d", "feat/analytics-qa-e"]
)
def test_historical_branches_cannot_pass_current_ci(branch, tmp_path):
    with pytest.raises(CheckFailure, match="未知成员分支"):
        ci_roles(branch, tmp_path)


@pytest.mark.parametrize(
    ("source", "target", "expected"),
    [
        ("feat/intelligence-d", "main", 1),
        ("feat/diagnosis-d", "feat/core-a", 1),
        ("feat/typo", "feat/core-a", 1),
        ("feat/core-a", "main", 0),
        ("main", "feat/core-a", 1),
    ],
)
def test_ci_pr_direction(monkeypatch, source, target, expected):
    from scripts.check_scope import main

    monkeypatch.setenv("GITHUB_HEAD_REF", source)
    monkeypatch.setenv("GITHUB_BASE_REF", target)
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    assert main() == expected


def test_d_ci_checks_both_modules_even_if_only_diagnosis_exists(tmp_path):
    (tmp_path / "backend/modules/diagnosis").mkdir(parents=True)
    assert ci_roles("feat/intelligence-d", tmp_path) == ["jobs", "diagnosis"]
    assert ci_roles("feat/core-a", tmp_path) == ["diagnosis"]
