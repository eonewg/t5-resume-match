"""An offline response fixture; contains no network calls or API credentials."""

from backend.schemas.contracts import DiagnosisInput, DiagnosisResult
from examples.fixtures import load_cases


class DiagnosisService:
    is_mock = True

    def diagnose(self, data: DiagnosisInput) -> DiagnosisResult:
        return DiagnosisResult(**load_cases()["diagnosis_example"])
