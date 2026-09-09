"""Resume isolation for pre-existing cross-module offline harnesses."""

import pytest


@pytest.fixture(autouse=True)
def offline_resume_for_diagnosis_protocol_harness(request, monkeypatch):
    # That existing test injects a Diagnosis transport but previously assumed Resume was offline.
    # Keep its scope unchanged without modifying D's tests or making an unintended paid AI call.
    # Resume AI itself is covered with explicit transports in tests/resume/test_ai*.py.
    if (
        getattr(request.node, "originalname", "")
        == "test_live_acceptance_harness_with_explicit_fixture"
    ):
        from backend.modules.resume.public import OfflineResumeService, ResumeService

        monkeypatch.setattr(ResumeService, "parse", OfflineResumeService.parse)
