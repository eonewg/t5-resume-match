"""Exercise frozen path selection in fresh interpreters, without changing global app state."""

import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("frozen", [False, True])
def test_config_and_database_roots(tmp_path, frozen):
    runtime = tmp_path / "便携 folder"
    runtime.mkdir()
    (runtime / ".env").write_text("DEEPSEEK_API_KEY=portable-test-placeholder\n", encoding="utf-8")
    root = Path(__file__).resolve().parents[2]
    code = f"""
import sys
from pathlib import Path
if {frozen!r}:
    sys.frozen = True
    sys.executable = {str(runtime / "T5-Resume-Match.exe")!r}
    sys._MEIPASS = {str(runtime / "_internal")!r}
from backend.core.paths import RESOURCE_ROOT, RUNTIME_ROOT, ENV_FILE
from backend.core.database import build_engine
from backend.modules.resume.config import ResumeSettings
from backend.modules.diagnosis.config import DiagnosisSettings
assert RUNTIME_ROOT == Path({str(runtime if frozen else root)!r})
assert RESOURCE_ROOT == Path({str(runtime / "_internal" if frozen else root)!r})
assert ENV_FILE == RUNTIME_ROOT / '.env'
if {frozen!r}:
    assert ResumeSettings().llm_api_key.get_secret_value() == 'portable-test-placeholder'
    assert DiagnosisSettings().api_key.get_secret_value() == 'portable-test-placeholder'
    engine = build_engine('sqlite:///data/t5.db')
    with engine.connect():
        pass
    engine.dispose()
    assert (RUNTIME_ROOT / 'data/t5.db').is_file()
"""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("T5_", "DEEPSEEK_", "PYTHON"))}
    env["PYTHONPATH"] = str(root)
    subprocess.run([sys.executable, "-c", code], cwd=tmp_path, env=env, check=True)
