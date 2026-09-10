"""Image adapter tests use synthetic images and a fake HTTP transport only."""

import json
from io import BytesIO

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image

from backend.core import screenshot
from backend.core.ai_settings import ModelConfig
from backend.core.config import Settings
from backend.main import create_app
from backend.schemas.contracts import JDCreate


def image_file(data=None):
    if data is None:
        output = BytesIO()
        Image.new("RGB", (32, 24), "white").save(output, format="PNG")
        data = output.getvalue()
    return UploadFile(filename="synthetic.png", file=BytesIO(data))


def config(style="chat_completions"):
    return ModelConfig(
        base_url="https://vision.example.test/v1",
        model="synthetic-vision",
        api_key="synthetic-key",
        api_style=style,
    )


@pytest.mark.parametrize("kind", ["job", "resume"])
@pytest.mark.parametrize("style", ["chat_completions", "responses"])
def test_payload_and_extracted_source(monkeypatch, kind, style):
    expected = (
        {"raw_text": "测试简历", "name": None, "education": "", "skills": [], "experience": []}
        if kind == "resume"
        else {
            "title": "测试岗位",
            "jd_text": "原始岗位要求",
            "requirements": "Python",
            "original_text": "原始岗位要求",
        }
    )
    calls = []

    def handler(request):
        payload = json.loads(request.content)
        calls.append(payload)
        content = payload["input" if style == "responses" else "messages"][0]["content"]
        image = content[1]["image_url"]
        assert (image if isinstance(image, str) else image["url"]).startswith(
            "data:image/png;base64,"
        )
        text = json.dumps(expected)
        body = (
            {
                "status": "completed",
                "output": [{"content": [{"type": "output_text", "text": text}]}],
            }
            if style == "responses"
            else {"choices": [{"finish_reason": "stop", "message": {"content": text}}]}
        )
        return httpx.Response(200, json=body)

    original = httpx.Client
    monkeypatch.setattr(
        screenshot.httpx,
        "Client",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )
    file = image_file()
    result = screenshot.recognize(file, config(style), kind)
    assert file.file.closed and len(calls) == 1
    assert (result.raw_text if kind == "resume" else result.original_text) == expected.get(
        "raw_text", expected.get("original_text")
    )
    if kind == "job":
        assert result.source_type == "unknown"


@pytest.mark.parametrize(
    "data,status",
    [(b"fake PNG", 422), (b"x" * (screenshot.LIMIT + 1), 413)],
    ids=["invalid", "oversize"],
)
def test_invalid_image_does_not_call_model(monkeypatch, data, status):
    monkeypatch.setattr(screenshot.httpx, "Client", lambda **kw: pytest.fail("unexpected network"))
    with pytest.raises(HTTPException) as error:
        screenshot.recognize(image_file(data), config(), "resume")
    assert error.value.status_code == status


@pytest.mark.parametrize(
    "body",
    [
        {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]},
        {
            "choices": [
                {"finish_reason": "stop", "message": {"refusal": "filtered", "content": "{}"}}
            ]
        },
        {"choices": [{"finish_reason": "stop", "message": {"content": "not json"}}]},
    ],
)
def test_failed_recognition_is_not_success(monkeypatch, body):
    original = httpx.Client
    monkeypatch.setattr(
        screenshot.httpx,
        "Client",
        lambda **kw: original(
            transport=httpx.MockTransport(lambda req: httpx.Response(200, json=body)), **kw
        ),
    )
    with pytest.raises(HTTPException) as error:
        screenshot.recognize(image_file(), config(), "resume")
    assert error.value.status_code == 502
    assert "filtered" not in str(error.value.detail)


def test_confirmed_job_sections_drive_matching_and_keep_original():
    job = JDCreate(
        title="测试岗位",
        jd_text="旧原文含 Java",
        requirements="Python",
        responsibilities="开发接口",
    )
    assert job.original_text == "旧原文含 Java"
    assert "Python" in job.jd_text and "Java" not in job.jd_text
    assert JDCreate(title="测试岗位", jd_text="传统原文").jd_text == "传统原文"


def test_split_section_numbering_keeps_content_and_non_list_numbers():
    assert (
        screenshot.renumber_section("1、第一项\n2、第二项\n6、最后一项")
        == "1、第一项\n2、第二项\n3、最后一项"
    )
    assert (
        screenshot.renumber_section("3、气象背景\n4、大数据经验\n5、数据处理")
        == "1、气象背景\n2、大数据经验\n3、数据处理"
    )
    assert (
        screenshot.renumber_section("3-5年经验\nPython 3.12\n2026年毕业\n\n2. 开发\n2. 测试")
        == "3-5年经验\nPython 3.12\n2026年毕业\n\n1、开发\n2、测试"
    )


@pytest.mark.parametrize("kind", ["jobs", "resumes"])
def test_upload_routes_are_preview_only(tmp_path, monkeypatch, kind):
    app = create_app(Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'preview.db'}"))
    with TestClient(app) as client:
        monkeypatch.setattr(app.state.ai_settings, "vision_config", config)
        original = httpx.Client
        expected = (
            {"title": "测试岗位", "jd_text": "岗位原文", "requirements": "Python"}
            if kind == "jobs"
            else {"raw_text": "测试简历", "skills": ["Python"]}
        )
        monkeypatch.setattr(
            screenshot.httpx,
            "Client",
            lambda **kw: original(
                transport=httpx.MockTransport(
                    lambda req: httpx.Response(
                        200,
                        json={
                            "choices": [
                                {
                                    "finish_reason": "stop",
                                    "message": {"content": json.dumps(expected)},
                                }
                            ]
                        },
                    )
                ),
                **kw,
            ),
        )
        file = image_file()
        response = client.post(
            f"/api/v1/{kind}/upload-preview",
            files={"file": ("sample.png", file.file.read(), "image/png")},
        )
        assert response.status_code == 200, response.text
        assert response.headers["x-t5-mock"] == "false"
        assert client.get(f"/api/v1/{kind}").json() == []
        if kind == "jobs":
            draft = response.json()
            assert draft["original_text"] == "岗位原文"
            draft["requirements"] = "SQL"
            saved = client.post("/api/v1/jobs", json=draft)
            assert saved.status_code == 201, saved.text
            assert "SQL" in saved.json()["jd_text"] and "Python" not in saved.json()["jd_text"]
