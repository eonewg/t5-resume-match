import pytest


@pytest.fixture(autouse=True)
def offline_embedding_defaults(monkeypatch):
    """Normal tests never inherit an operator's opt-in local model configuration."""
    monkeypatch.setenv("T5_JOBS_EMBEDDING", "off")
    monkeypatch.setenv("T5_JOBS_SEMANTIC_WEIGHT", "0.2")
