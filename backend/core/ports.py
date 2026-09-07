"""Synchronous public service interfaces; implementations run in FastAPI's thread pool."""

from typing import Protocol

from backend.schemas.contracts import (
    JD,
    AnalysisResult,
    DiagnosisInput,
    DiagnosisResult,
    JDData,
    JDInput,
    MatchResult,
    Resume,
    ResumeData,
    TextInput,
)


class ResumeProvider(Protocol):
    def parse(self, data: TextInput) -> ResumeData: ...


class JobsProvider(Protocol):
    def parse(self, data: JDInput) -> JDData: ...
    def match(self, resume: Resume, jd: JD) -> MatchResult: ...


class DiagnosisProvider(Protocol):
    def diagnose(self, data: DiagnosisInput) -> DiagnosisResult: ...


class AnalyticsProvider(Protocol):
    def analyze(self, jobs: list[JD]) -> AnalysisResult: ...
