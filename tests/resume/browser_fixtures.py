"""Explicit offline UI fixture. Never a production provider or AI-quality result."""

from backend.modules.resume.public import OfflineResumeService


class OfflineResumeFixture(OfflineResumeService):
    is_mock = True
