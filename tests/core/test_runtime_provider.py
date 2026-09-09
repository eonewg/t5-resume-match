"""Targeted formal/default provider checks; no model requests."""

from backend.core.config import Settings
from backend.core.mocks import MockDiagnosis
from backend.core.providers import provider_class
from backend.modules.diagnosis.public import DiagnosisService


def test_default_diagnosis_entrypoint_is_real():
    target = Settings.model_fields["diagnosis_provider"].default
    assert provider_class("diagnosis", target) is DiagnosisService


def test_mock_diagnosis_requires_explicit_selection():
    settings = Settings(_env_file=None, diagnosis_provider="mock")
    assert provider_class("diagnosis", settings.diagnosis_provider) is MockDiagnosis
