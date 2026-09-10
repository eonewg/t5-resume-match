"""Same-origin local administration. Normal reads are masked; key reveal requires an explicit action."""

from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response

from backend.core.ai_settings import (
    AISettings,
    ProfileAction,
    ResetConfig,
    RevealKey,
    SaveExit,
    UpdateConfig,
)


def local_settings(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if not request.client or request.client.host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(403, "AI 设置仅允许从本机访问。")
    host = request.url.hostname
    if host not in {"127.0.0.1", "localhost", "::1", "testserver"}:
        raise HTTPException(403, "请通过本机地址打开设置。")
    origin = request.headers.get("origin")
    if (
        request.headers.get("sec-fetch-site") == "cross-site"
        or origin
        and (
            urlsplit(origin).scheme != request.url.scheme
            or urlsplit(origin).netloc != request.url.netloc
        )
    ):
        raise HTTPException(403, "请在当前应用页面修改 AI 设置。")
    return request.app.state.ai_settings


router = APIRouter(prefix="/api/v1/settings/ai", tags=["settings"])
Manager = Annotated[AISettings, Depends(local_settings)]


@router.get("")
def get_settings(manager: Manager):
    return manager.view()


@router.put("")
def update_settings(data: UpdateConfig, manager: Manager):
    return manager.save(data)


@router.post("/reset")
def reset_settings(data: ResetConfig, manager: Manager):
    return manager.reset(data)


@router.post("/test")
def test_settings(data: UpdateConfig, manager: Manager):
    return manager.test(data)


@router.post("/activate")
def activate_profile(data: ProfileAction, manager: Manager):
    return manager.activate(data)


@router.post("/profiles/delete")
def delete_profile(data: ProfileAction, manager: Manager):
    return manager.delete(data)


@router.post("/key")
def reveal_key(data: RevealKey, manager: Manager):
    return manager.reveal(data)


@router.post("/save-exit")
def save_and_exit(data: SaveExit, request: Request, background: BackgroundTasks, manager: Manager):
    result = manager.save_exit(data)

    async def stop():
        # Run after the response is sent, on Uvicorn's main event-loop thread.
        request.app.state.shutdown_callback()

    background.add_task(stop)
    return result
