"""Read-only bundle resources and user-owned portable files have separate roots."""

import sys
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)
RESOURCE_ROOT = Path(sys._MEIPASS) if FROZEN else Path(__file__).resolve().parents[2]
RUNTIME_ROOT = Path(sys.executable).resolve().parent if FROZEN else RESOURCE_ROOT
ENV_FILE = RUNTIME_ROOT / ".env"
