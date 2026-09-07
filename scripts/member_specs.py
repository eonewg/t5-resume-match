"""A/D ownership and the four public module contracts.

A owns platform, Resume, Analytics, QA, database, shared frontend and CI.
D owns Jobs (including Matching/Embedding) and Diagnosis.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Module:
    key: str
    owner: str
    entrypoint: str
    example: str
    tests: str


BRANCHES = {"A": "feat/core-a", "D": "feat/intelligence-d"}
MODULES = {
    key: Module(
        key,
        owner,
        f"backend.modules.{key}.public:{service}",
        f"examples.providers.{key}:{service}",
        f"tests/{key}",
    )
    for key, owner, service in (
        ("resume", "A", "ResumeService"),
        ("jobs", "D", "JobsService"),
        ("diagnosis", "D", "DiagnosisService"),
        ("analytics", "A", "AnalyticsService"),
    )
}

OWNER_MODULES = {
    owner: tuple(key for key, spec in MODULES.items() if spec.owner == owner) for owner in BRANCHES
}
