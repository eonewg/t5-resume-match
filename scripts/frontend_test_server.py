"""Isolated browser acceptance server. Never calls a paid AI or opens the user database."""

import argparse
import tempfile
from pathlib import Path

import uvicorn

from backend.core.config import Settings
from backend.main import create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="t5-react-e2e-") as folder:
        settings = Settings(
            _env_file=None,
            database_url=f"sqlite:///{(Path(folder) / 'test.db').as_posix()}",
            resume_provider="backend.modules.resume.public:OfflineResumeService",
            jobs_provider="backend.modules.jobs.public:JobsService",
            diagnosis_provider="mock",
            analytics_provider="backend.modules.analytics.public:AnalyticsService",
        )
        uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
