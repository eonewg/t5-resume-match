"""Local browser QA server in a disposable PostgreSQL schema; not part of the app API.

Connect T5_TEST_DATABASE_URL, then python -m tests.core.product_browser_server.
POST /__verification_shutdown only exists in this loopback-only test harness.
"""

import argparse
import os
from contextlib import asynccontextmanager, contextmanager

import uvicorn

from backend.core.config import Settings
from backend.main import create_app
from tests.core.test_vectors import pg_engine


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live-diagnosis", action="store_true")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--market-supplement", action="store_true")
    args = parser.parse_args()
    with contextmanager(pg_engine.__wrapped__)() as engine:
        app = create_app(Settings(_env_file=None, database_url="sqlite://"))
        original_lifespan = app.router.lifespan_context

        @asynccontextmanager
        async def lifespan(application):
            async with original_lifespan(application):
                original = application.state.engine
                application.state.engine = engine
                try:
                    if args.live_diagnosis:
                        from backend.core.providers import Provider
                        from backend.modules.diagnosis.config import DiagnosisSettings
                        from backend.modules.diagnosis.public import DiagnosisService

                        service = DiagnosisService(
                            settings=DiagnosisSettings(_env_file=args.env_file)
                        )
                        application.state.providers["diagnosis"] = Provider(
                            service, service.is_mock
                        )
                    if args.market_supplement:
                        from sqlalchemy.orm import Session

                        from scripts.import_final_samples import import_samples

                        with Session(engine) as session, session.begin():
                            import_samples(session, application.state.providers["jobs"])
                    yield
                finally:
                    application.state.engine = original

        app.router.lifespan_context = lifespan
        server = uvicorn.Server(
            uvicorn.Config(
                app,
                host="127.0.0.1",
                port=int(os.environ.get("T5_PRODUCT_PORT", "8770")),
                log_level="warning",
            )
        )

        @app.post("/__verification_shutdown")
        def shutdown():
            server.should_exit = True
            return {"stopping": True}

        server.run()


if __name__ == "__main__":
    main()
