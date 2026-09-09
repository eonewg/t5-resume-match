from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.api.routes import router
from backend.core.config import ROOT, Settings
from backend.core.database import build_engine
from backend.core.migrations import migrate
from backend.core.providers import load_providers


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        app.state.providers = load_providers(settings)
        engine = build_engine(settings.database_url)
        app.state.engine = engine
        try:
            migrate(engine)
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="T5 AI 简历诊断与岗位匹配", version="0.1.0", lifespan=lifespan)
    app.include_router(router)
    frontend = ROOT / "frontend/dist"
    app.mount(
        "/assets",
        StaticFiles(directory=frontend / "assets", check_dir=False),
        name="frontend-assets",
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, error):
        return JSONResponse(
            status_code=error.status_code,
            content={"error": {"code": str(error.status_code), "message": error.detail}},
            headers=error.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error):
        details = [{"location": list(e["loc"]), "type": e["type"]} for e in error.errors()]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "422",
                    "message": "输入不符合公共契约",
                    "details": details,
                }
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, error):
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "503",
                    "message": "数据库暂不可用",
                }
            },
        )

    @app.get("/", include_in_schema=False)
    def home():
        if not (frontend / "index.html").is_file():
            raise HTTPException(503, "前端尚未构建，请先在 frontend 运行 npm ci 和 npm run build。")
        return FileResponse(frontend / "index.html", headers={"Cache-Control": "no-cache"})

    @app.get("/demo/sample.json", include_in_schema=False)
    def demo_sample():
        # Only the explicitly synthetic public fixture is served, never the project root.
        return FileResponse(ROOT / "examples/fixtures/team.json", media_type="application/json")

    @app.get("/health", tags=["core"])
    def health(request: Request):
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/ready", tags=["core"])
    def ready(request: Request):
        health(request)
        mocks = [name for name, p in request.app.state.providers.items() if p.is_mock]
        if mocks:
            raise HTTPException(503, {"message": "真实模块尚未全部接入", "mock_modules": mocks})
        return {"status": "ready"}

    return app


app = create_app()
