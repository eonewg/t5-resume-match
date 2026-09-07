"""One source for CLI entrypoints and CI branch-to-role mapping."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Member:
    key: str
    branch: str
    entrypoint: str
    example: str
    tests: str


MEMBERS = {
    "B": Member(
        "resume",
        "feat/resume-b",
        "backend.modules.resume.public:ResumeService",
        "examples.providers.resume:ResumeService",
        "tests/resume",
    ),
    "C": Member(
        "jobs",
        "feat/matching-c",
        "backend.modules.jobs.public:JobsService",
        "examples.providers.jobs:JobsService",
        "tests/jobs",
    ),
    "D": Member(
        "diagnosis",
        "feat/diagnosis-d",
        "backend.modules.diagnosis.public:DiagnosisService",
        "examples.providers.diagnosis:DiagnosisService",
        "tests/diagnosis",
    ),
    "E": Member(
        "analytics",
        "feat/analytics-qa-e",
        "backend.modules.analytics.public:AnalyticsService",
        "examples.providers.analytics:AnalyticsService",
        "tests/analytics",
    ),
}
