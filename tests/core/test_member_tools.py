import sys
import types

import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.core.providers import load_provider, provider_class
from backend.main import create_app
from examples.fixtures import load_cases
from scripts.check_member import CheckFailure, ci_modules, module_tests_exist, probe
from scripts.check_scope import allowed_path, violations
from scripts.member_specs import MODULES, branch_owner


@pytest.mark.parametrize("module", MODULES)
def test_runnable_examples(module):
    result = probe(module, MODULES[module].example, examples=True)
    assert result.startswith("EXAMPLE_CHECK_PASS")
    with pytest.raises(CheckFailure, match="示例入口"):
        probe(module, MODULES[module].example)


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
    assert ci_modules("feat/intelligence-d", tmp_path) == ["jobs", "diagnosis"]
    assert ci_modules("feat/diagnosis-llm-d", tmp_path) == ["jobs", "diagnosis"]
    assert ci_modules("feat/core-a", tmp_path) == []
    with pytest.raises(CheckFailure, match="缺少"):
        module_tests_exist("resume", tmp_path)
    with pytest.raises(CheckFailure, match="未知 owner 分支"):
        ci_modules("feat/typo", tmp_path)


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


def test_unassigned_branch_cannot_pass_ci(tmp_path):
    with pytest.raises(CheckFailure, match="未知 owner 分支"):
        ci_modules("feat/unassigned", tmp_path)


@pytest.mark.parametrize(
    ("branch", "expected"),
    [
        ("feat/core-a", "A"),
        ("feat/ui-polish-a", "A"),
        ("feat/resume-ai-a", "A"),
        ("feat/final-qa-a", "A"),
        ("feat/intelligence-d", "D"),
        ("feat/diagnosis-reliability-d", "D"),
        ("feat/jobs-ranking-d", "D"),
        ("feat/diagnosis-llm-d", "D"),
        ("feat/ui-refresh-d", "D"),
        ("main", None),
        ("feat/foo", None),
        ("feature/ui-a", None),
        ("fix/test-d", None),
        ("random", None),
        ("", None),
    ],
)
def test_branch_owner_follows_naming_convention(branch, expected):
    assert branch_owner(branch) == expected


@pytest.mark.parametrize(
    ("source", "target", "expected"),
    [
        ("feat/ui-polish-a", "main", 1),
        ("feat/resume-ai-a", "main", 1),
        ("feat/final-qa-a", "main", 1),
        ("feat/diagnosis-reliability-d", "main", 1),
        ("feat/jobs-ranking-d", "main", 1),
        ("feature/ui-a", "feat/core-a", 1),
        ("fix/test-d", "feat/core-a", 1),
        ("feat/foo", "main", 1),
        ("random", "feat/core-a", 1),
        ("", "feat/core-a", 1),
    ],
)
def test_ci_rejects_wrong_pr_target_and_unknown_names(monkeypatch, source, target, expected):
    from scripts.check_scope import main

    monkeypatch.setenv("GITHUB_HEAD_REF", source)
    monkeypatch.setenv("GITHUB_REF_NAME", source)
    monkeypatch.setenv("GITHUB_BASE_REF", target)
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    assert main() == expected


@pytest.mark.parametrize("source", ["feat/ui-polish-a", "feat/resume-ai-a", "feat/final-qa-a"])
def test_a_feature_pr_targets_core_a(monkeypatch, source):
    from scripts.check_scope import main

    monkeypatch.setenv("GITHUB_HEAD_REF", source)
    monkeypatch.setenv("GITHUB_BASE_REF", "feat/core-a")
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    assert main() == 0


@pytest.mark.parametrize("source", ["feat/intelligence-d", "feat/diagnosis-reliability-d"])
@pytest.mark.parametrize(
    "path, expected",
    [
        ("backend/modules/diagnosis/client.py", 0),
        ("backend/modules/jobs/public.py", 0),
        ("backend/modules/resume/public.py", 1),
        (".github/workflows/core.yml", 1),
    ],
)
def test_new_d_branches_keep_same_scope(monkeypatch, source, path, expected):
    from scripts import check_scope

    monkeypatch.setenv("GITHUB_HEAD_REF", source)
    monkeypatch.setenv("GITHUB_BASE_REF", "feat/core-a")
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    monkeypatch.setattr(
        check_scope.subprocess,
        "run",
        lambda *args, **kwargs: types.SimpleNamespace(returncode=0, stdout=(path + "\0").encode()),
    )
    assert check_scope.main() == expected


def test_ci_modules_follows_branch_naming(tmp_path):
    assert ci_modules("feat/ui-polish-a", tmp_path) == []
    assert ci_modules("feat/jobs-ranking-d", tmp_path) == ["jobs", "diagnosis"]
    assert ci_modules("feat/diagnosis-reliability-d", tmp_path) == ["jobs", "diagnosis"]
    with pytest.raises(CheckFailure, match="未知 owner 分支"):
        ci_modules("feat/typo", tmp_path)


@pytest.mark.parametrize(
    ("source", "target", "expected"),
    [
        ("feat/intelligence-d", "main", 1),
        ("feat/diagnosis-llm-d", "main", 1),
        ("feat/diagnosis-llm-d", "feat/intelligence-d", 1),
        ("feat/diagnosis-llm-d-typo", "feat/core-a", 1),
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
    assert ci_modules("feat/intelligence-d", tmp_path) == ["jobs", "diagnosis"]
    assert ci_modules("feat/diagnosis-llm-d", tmp_path) == ["jobs", "diagnosis"]
    assert ci_modules("feat/core-a", tmp_path) == ["diagnosis"]


def test_owner_mapping_covers_current_modules():
    from scripts.member_specs import BRANCHES, OWNER_MODULES

    assert BRANCHES == {"A": "feat/core-a", "D": "feat/intelligence-d"}
    assert OWNER_MODULES == {
        "A": ("resume", "analytics"),
        "D": ("jobs", "diagnosis"),
    }
    assert set(MODULES) == {"resume", "jobs", "diagnosis", "analytics"}


@pytest.mark.parametrize(
    "path, expected",
    [
        ("frontend/src/app.js", 0),
        ("frontend/index.html", 0),
        ("docs/ui/design.md", 0),
        ("docs/frontend-integration.md", 0),
        ("docs/integration_requests/D-ui-refresh.md", 0),
        ("backend/modules/jobs/public.py", 1),
        ("backend/modules/diagnosis/client.py", 1),
        ("backend/models/entities.py", 1),
        ("docs/api-contract.md", 1),
        ("docs/postgres.md", 1),
        ("docs/team-rules.md", 1),
        (".github/workflows/core.yml", 1),
        ("frontend/.env", 1),
    ],
)
def test_ui_branch_has_separate_scope(monkeypatch, path, expected):
    from scripts import check_scope

    monkeypatch.setenv("GITHUB_HEAD_REF", "feat/ui-refresh-d")
    monkeypatch.setenv("GITHUB_BASE_REF", "feat/core-a")
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    monkeypatch.setattr(
        check_scope.subprocess,
        "run",
        lambda *args, **kwargs: types.SimpleNamespace(returncode=0, stdout=(path + "\0").encode()),
    )
    assert check_scope.main() == expected


def test_ui_branch_preserves_all_contract_gates(tmp_path):
    assert ci_modules("feat/ui-refresh-d", tmp_path) == list(MODULES)
    assert not allowed_path("D", "frontend/src/app.js", "feat/intelligence-d")
    with pytest.raises(CheckFailure):
        ci_modules("feat/ui-refresh-d-typo", tmp_path)


def test_ui_branch_cannot_target_main(monkeypatch):
    from scripts import check_scope

    monkeypatch.setenv("GITHUB_HEAD_REF", "feat/ui-refresh-d")
    monkeypatch.setenv("GITHUB_BASE_REF", "main")
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    assert check_scope.main() == 1


@pytest.mark.parametrize("source", ["feat/intelligence-d", "feat/diagnosis-llm-d"])
@pytest.mark.parametrize(
    "path, expected", [("backend/modules/diagnosis/client.py", 0), ("backend/core/config.py", 1)]
)
def test_d_branches_keep_same_scope(monkeypatch, source, path, expected):
    from scripts import check_scope

    monkeypatch.setenv("GITHUB_HEAD_REF", source)
    monkeypatch.setenv("GITHUB_BASE_REF", "feat/core-a")
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    monkeypatch.setattr(
        check_scope.subprocess,
        "run",
        lambda *args, **kwargs: types.SimpleNamespace(returncode=0, stdout=(path + "\0").encode()),
    )
    assert check_scope.main() == expected


@pytest.mark.parametrize("invalid", ["async", "signature", "noncallable"])
def test_invalid_transactional_jobs_hook_rejected(monkeypatch, invalid):
    class Jobs:
        def parse(self, data):
            return data

        def match(self, resume, jd):
            return None

    async def async_hook(self, resume, jd, context):
        return None

    def wrong_hook(self, resume, jd):
        return None

    Jobs.match_with_context = {"async": async_hook, "signature": wrong_hook, "noncallable": None}[
        invalid
    ]
    with pytest.raises(TypeError):
        provider_class("jobs", module_with(monkeypatch, Jobs))
