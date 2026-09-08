"""Local browser QA server in a disposable PostgreSQL schema; not part of the app API.

Connect T5_TEST_DATABASE_URL, then python -m tests.core.product_browser_server.
POST /__verification_shutdown only exists in this loopback-only test harness.
"""

import os
from contextlib import asynccontextmanager, contextmanager

import uvicorn

from backend.core.config import Settings
from backend.main import create_app
from tests.core.test_vectors import pg_engine


def main():
    with contextmanager(pg_engine.__wrapped__)() as engine:
        app = create_app(Settings(_env_file=None, database_url="sqlite://"))
        original_lifespan = app.router.lifespan_context

        @asynccontextmanager
        async def lifespan(application):
            async with original_lifespan(application):
                original = application.state.engine
                application.state.engine = engine
                try:
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
