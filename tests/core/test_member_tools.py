import subprocess
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


def test_resume_offline_probe_never_constructs_or_calls_service(monkeypatch):
    class PaidService:
        def __init__(self):
            raise AssertionError("Do not initialize the paid client")

        def parse(self, data):
            raise AssertionError("Do not call the paid client")

    assert probe("resume", module_with(monkeypatch, PaidService)).startswith("OFFLINE")


def test_ci_requires_all_modules_even_when_missing(tmp_path):
    assert ci_modules() == list(MODULES)
    for module in MODULES:
        with pytest.raises(CheckFailure, match="缺少"):
            module_tests_exist(module, tmp_path)


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


def test_branch_policy_is_separate_from_contract_checks():
    from scripts.check_scope import ci_gate

    assert ci_gate("random", "main")
    assert ci_modules() == list(MODULES)


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
    "source,target",
    [
        ("chore/foo", "feat/core-a"),
        ("feat/foo", "develop"),
        ("main", "main"),
        ("feature/foo", "main"),
        ("random", "main"),
        ("", "main"),
        ("refs/tags/v1", ""),
        ("--help", "main"),
        ("feat/", "main"),
        ("fix/../main", "main"),
        ("docs/foo.lock", "main"),
        ("test/foo bar", "main"),
        ("chore/foo\nbar", "main"),
        ("refactor/foo@{bar}", "main"),
    ],
)
def test_ci_rejects_wrong_target_and_unsupported_refs(source, target):
    from scripts.check_scope import ci_gate

    assert ci_gate(source, target)


@pytest.mark.parametrize(
    "source",
    [
        "chore/foo",
        "fix/foo",
        "feat/foo",
        "docs/foo",
        "test/foo",
        "refactor/foo",
        "feat/ui-polish-a",
        "feat/jobs-ranking-d",
        "fix/nested/topic",
    ],
)
@pytest.mark.parametrize("target", ["main", ""])
def test_maintenance_branches_pass_without_owner_suffix(source, target):
    from scripts.check_scope import ci_gate

    assert ci_gate(source, target) == ""


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

    monkeypatch.setattr(check_scope.subprocess, "check_output", lambda *a, **k: source + "\n")
    monkeypatch.setattr(sys, "argv", ["check_scope", "D", "--base", "origin/main"])
    monkeypatch.setattr(
        check_scope.subprocess,
        "run",
        lambda *args, **kwargs: types.SimpleNamespace(returncode=0, stdout=(path + "\0").encode()),
    )
    assert check_scope.main() == expected


@pytest.mark.parametrize("source", ["main", "chore/foo", "feat/jobs-ranking-d"])
def test_ci_contract_cli_checks_all_modules(monkeypatch, source):
    from scripts import check_member

    monkeypatch.setenv("GITHUB_REF_NAME", source)
    calls = []
    monkeypatch.setattr(
        check_member, "module_tests_exist", lambda key: calls.append(("tests", key))
    )
    monkeypatch.setattr(check_member, "run_probe", lambda key, args: calls.append(("probe", key)))
    assert check_member.main(["--ci"]) == 0
    assert calls == [(kind, key) for key in MODULES for kind in ("tests", "probe")]


def test_main_push_does_not_require_owner():
    from scripts.check_scope import ci_gate

    assert ci_gate("main", "") == ""


def test_contract_cli_does_not_skip_missing_modules(monkeypatch):
    from scripts import check_member

    calls = []

    def missing(key):
        calls.append(key)
        raise CheckFailure("缺少模块测试")

    monkeypatch.setattr(check_member, "module_tests_exist", missing)
    with pytest.raises(CheckFailure, match="缺少"):
        check_member.main(["--ci"])
    assert calls == ["resume"]


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

    monkeypatch.setattr(
        check_scope.subprocess, "check_output", lambda *a, **k: "feat/ui-refresh-d\n"
    )
    monkeypatch.setattr(sys, "argv", ["check_scope", "D", "--base", "origin/main"])
    monkeypatch.setattr(
        check_scope.subprocess,
        "run",
        lambda *args, **kwargs: types.SimpleNamespace(returncode=0, stdout=(path + "\0").encode()),
    )
    assert check_scope.main() == expected


def test_ui_branch_preserves_all_contract_gates():
    assert ci_modules() == list(MODULES)
    assert not allowed_path("D", "frontend/src/app.js", "feat/intelligence-d")


def test_legacy_ui_branch_can_target_main():
    from scripts.check_scope import ci_gate

    assert ci_gate("feat/ui-refresh-d", "main") == ""


@pytest.mark.parametrize("source", ["feat/intelligence-d", "feat/diagnosis-llm-d"])
@pytest.mark.parametrize(
    "path, expected", [("backend/modules/diagnosis/client.py", 0), ("backend/core/config.py", 1)]
)
def test_d_branches_keep_same_scope(monkeypatch, source, path, expected):
    from scripts import check_scope

    monkeypatch.setattr(check_scope.subprocess, "check_output", lambda *a, **k: source + "\n")
    monkeypatch.setattr(sys, "argv", ["check_scope", "D", "--base", "origin/main"])
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


@pytest.mark.parametrize(
    "source,target", [("main", ""), ("chore/foo", "main"), ("feat/foo", "main")]
)
def test_ci_checks_all_tracked_files_without_old_base(monkeypatch, tmp_path, source, target):
    from scripts import check_scope

    def git(*args):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init")
    # No commits, origin or legacy base exist. CI still checks the entire index.
    (tmp_path / "README.md").write_text("maintenance")
    (tmp_path / ".env").write_text("fixture-only")
    git("add", "README.md")
    monkeypatch.setattr(check_scope, "ROOT", tmp_path)
    monkeypatch.setenv("GITHUB_HEAD_REF", source if target else "")
    monkeypatch.setenv("GITHUB_REF_NAME", source if not target else "14/merge")
    monkeypatch.setenv("GITHUB_BASE_REF", target)
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    assert check_scope.main() == 0  # Untracked local .env is not a delivery.
    git("add", "-f", ".env")
    assert check_scope.main() == 1
    git("rm", "--cached", ".env")
    assert check_scope.main() == 0


@pytest.mark.parametrize(
    "path", [".env", "nested/.env", "nested/__pycache__/cache", "nested/a.pyc", "data/local.db"]
)
@pytest.mark.parametrize("owner", [None, "D"])
def test_delivery_prohibitions_apply_without_owner(path, owner):
    assert any("不应交付" in error for error in violations(owner, [path]))


def test_delivery_size_limit_applies_without_owner(monkeypatch, tmp_path):
    from scripts import check_scope

    monkeypatch.setattr(check_scope, "ROOT", tmp_path)
    path = tmp_path / "large.txt"
    with path.open("wb") as stream:
        stream.truncate(5 * 1024 * 1024)
    assert violations(None, [path.name]) == []
    with path.open("ab") as stream:
        stream.write(b"x")
    assert any("5 MiB" in error for error in violations(None, [path.name]))


def test_ci_git_failure_is_not_success(monkeypatch):
    from scripts import check_scope

    monkeypatch.setenv("GITHUB_HEAD_REF", "")
    monkeypatch.setenv("GITHUB_REF_NAME", "main")
    monkeypatch.setenv("GITHUB_BASE_REF", "")
    monkeypatch.setattr(sys, "argv", ["check_scope", "--ci"])
    monkeypatch.setattr(
        check_scope.subprocess, "run", lambda *a, **k: types.SimpleNamespace(returncode=1)
    )
    assert check_scope.main() == 1
