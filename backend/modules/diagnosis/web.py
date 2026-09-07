"""Standalone D demo/API. A may mount this app; no shared routes are edited."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.schemas.contracts import DiagnosisInput

from .errors import ConfigurationError, DiagnosisError
from .mock import MockLLM
from .public import DiagnosisService
from .schema import DiagnosisDetail


class DetailResponse(BaseModel):
    is_mock: bool
    result: DiagnosisDetail


def create_app(service: DiagnosisService | None = None, *, is_mock: bool = False) -> FastAPI:
    service = service if service is not None else DiagnosisService()
    is_mock = is_mock or service.is_mock
    app = FastAPI(title="D · 简历 AI 诊断", version="1.0.0")
    assets = Path(__file__).parent / "assets"
    app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(assets / "index.html")

    @app.get("/api/status")
    def status():
        return {"is_mock": is_mock}

    @app.exception_handler(DiagnosisError)
    async def diagnosis_error(request, error):
        return JSONResponse(
            status_code=503 if isinstance(error, ConfigurationError) else 502,
            content={"error": str(error)},
        )

    @app.post("/api/diagnose", response_model=DetailResponse)
    def diagnose(data: DiagnosisInput):
        return DetailResponse(is_mock=is_mock, result=service.diagnose_detail(data))

    return app


def create_demo_app() -> FastAPI:
    return create_app(DiagnosisService(client=MockLLM()), is_mock=True)
