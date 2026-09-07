from dataclasses import dataclass
from importlib import import_module
from typing import Any

from backend.core.config import Settings
from backend.core.mocks import MockAnalytics, MockDiagnosis, MockJobs, MockResume


@dataclass
class Provider:
    service: Any
    is_mock: bool


def load_providers(settings: Settings) -> dict[str, Provider]:
    providers = {}
    definitions = {
        "resume": (MockResume, ("parse",)),
        "jobs": (MockJobs, ("parse", "match")),
        "diagnosis": (MockDiagnosis, ("diagnose",)),
        "analytics": (MockAnalytics, ("analyze",)),
    }
    for name, (mock, methods) in definitions.items():
        target = getattr(settings, f"{name}_provider")
        if target == "mock":
            service = mock()
        else:
            module, separator, attribute = target.partition(":")
            if not separator:
                raise ValueError(f"{name} provider must use module:Class syntax")
            service = getattr(import_module(module), attribute)()
        if not all(callable(getattr(service, method, None)) for method in methods):
            raise TypeError(f"{name} provider does not implement its public port")
        providers[name] = Provider(service, target == "mock")
    return providers
