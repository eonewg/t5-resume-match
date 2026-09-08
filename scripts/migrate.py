"""Run additive migrations using T5_DATABASE_URL (never prints credentials)."""

from backend.core.config import Settings
from backend.core.database import build_engine
from backend.core.migrations import migrate


def main():
    engine = build_engine(Settings().database_url)
    try:
        migrate(engine)
        print("PASS: database migrations applied")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
