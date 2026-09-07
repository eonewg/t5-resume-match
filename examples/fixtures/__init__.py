import json
from pathlib import Path


def load_cases() -> dict:
    """Return a fresh copy so callers cannot modify another test's fixtures."""
    return json.loads(Path(__file__).with_name("team.json").read_text(encoding="utf-8"))
