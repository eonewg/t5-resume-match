"""Module contracts and active owner branches used by CLI and CI."""

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
