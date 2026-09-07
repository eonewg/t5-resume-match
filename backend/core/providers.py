from dataclasses import dataclass
from importlib import import_module
from inspect import isclass, iscoroutinefunction, signature
from typing import Any

from backend.core.config import Settings
from backend.core.mocks import MockAnalytics, MockDiagnosis, MockJobs, MockResume


@dataclass
class Provider:
    service: Any
    is_mock: bool


DEFINITIONS = {
    "resume": (MockResume, {"parse": 1}),
    "jobs": (MockJobs, {"parse": 1, "match": 2}),
    "diagnosis": (MockDiagnosis, {"diagnose": 1}),
    "analytics": (MockAnalytics, {"analyze": 1}),
}


def provider_class(name: str, target: str):
    """Inspect a public entrypoint without constructing it or calling paid services."""
    mock, methods = DEFINITIONS[name]
    if target == "mock":
        service_class = mock
    else:
        module, separator, attribute = target.partition(":")
        if not separator:
            raise ValueError(f"{name} provider must use module:Class syntax")
        service_class = getattr(import_module(module), attribute)
    if not isclass(service_class):
        raise TypeError(f"{name} provider must expose a class")
    signature(service_class).bind()  # Constructor must accept zero arguments.
    for method, count in methods.items():
        function = getattr(service_class, method, None)
        if not callable(function) or iscoroutinefunction(function):
            raise TypeError(f"{name}.{method} must be a synchronous method")
        signature(function).bind(None, *([None] * count))
    return service_class


def load_provider(name: str, target: str) -> Provider:
    service = provider_class(name, target)()
    marker = getattr(service, "is_mock", False)
    if not isinstance(marker, bool):
        raise TypeError(f"{name}.is_mock must be a boolean")
    return Provider(service, target == "mock" or marker)


def load_providers(settings: Settings) -> dict[str, Provider]:
    return {
        name: load_provider(name, getattr(settings, f"{name}_provider")) for name in DEFINITIONS
    }
