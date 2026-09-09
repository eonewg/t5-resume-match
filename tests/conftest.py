"""Resume isolation for pre-existing cross-module offline harnesses."""

import pytest


@pytest.fixture(autouse=True)
def isolate_resume_network(request, monkeypatch):
    from backend.modules.resume import ai

    def unexpected_transport(*args, **kwargs):
        raise AssertionError("Tests must explicitly inject a Resume AI transport")

    # A local .env must never turn a unit/integration test into a paid AI request.
    monkeypatch.setattr(ai, "transport", unexpected_transport)
    # Existing Diagnosis protocol and Jobs cache harnesses assumed Resume was offline.
    # Preserve their original purpose without changing D's implementation or assertions.
    # Resume AI itself is covered with explicit transports in tests/resume/test_ai*.py.
    if (
        getattr(request.node, "originalname", "")
        == "test_live_acceptance_harness_with_explicit_fixture"
        or request.node.path.name == "test_cache_postgres.py"
    ):
        from backend.modules.resume.public import OfflineResumeService, ResumeService

        monkeypatch.setattr(ResumeService, "parse", OfflineResumeService.parse)
