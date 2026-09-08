"""Real parser, editable persistence and fact/source preservation."""

import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.core.providers import Provider
from backend.main import create_app
from backend.modules.resume.public import ResumeService
from backend.schemas.contracts import ResumeData, TextInput


def parse(text):
    return ResumeService().parse(TextInput(raw_text=text))


def test_chinese_sections_preserve_verbatim_source_and_experience():
    raw = (
        "  姓名：测试同学\r\n学历：本科，信息管理专业\r\n"
        "技能：Python、SQL、Excel\r\n项目经历：课程数据分析\r\n"
        "使用 Python 整理 30 条合成数据。\r\n\r\n实习经历：整理课程资料。\r\n "
    )
    result = parse(raw)
    assert result.raw_text == raw
    assert result.name == "测试同学"
    assert result.education == "本科，信息管理专业"
    assert result.skills == ["Python", "SQL", "Excel"]
    assert result.experience == ["课程数据分析\n使用 Python 整理 30 条合成数据。", "整理课程资料。"]


def test_english_markdown_sections_and_repeated_skills():
    result = parse(
        "# Full Name: Alex Example\n## Education\nSample University, BSc\n"
        "## Technical Skills\nPython, python, SQL, C++, C#, JavaScript\n"
        "## Projects\nUsed Python to clean a course dataset.\n"
        "## Interests\nJava games"
    )
    assert result.name == "Alex Example"
    assert result.education == "Sample University, BSc"
    assert result.skills == ["Python", "SQL", "C++", "C#", "JavaScript"]
    assert result.experience == ["Used Python to clean a course dataset."]


@pytest.mark.parametrize("raw", ["未提供学历和技术经历。", "欢迎查看我的简历", "姓名：暂无"])
def test_missing_fields_are_empty_not_invented(raw):
    assert parse(raw).model_dump() == {
        "name": None,
        "education": "",
        "skills": [],
        "experience": [],
        "raw_text": raw,
    }


def test_negated_or_future_skills_and_partial_tokens_are_not_claimed():
    result = parse(
        "技能：Python，尚未掌握 SQL；计划学习 Docker；not familiar with Java；"
        "pythonista，NoSQL，RStudio\n求职意向：希望从事 Rust 开发"
    )
    assert result.skills == ["Python"]


def test_unrecognized_section_stops_experience_and_keeps_original():
    raw = "项目经历：使用 SQL 整理课程样例\n志愿活动：\n参加校园活动\n学历：无"
    result = parse(raw)
    assert result.experience == ["使用 SQL 整理课程样例"]
    assert result.education == ""
    assert result.raw_text == raw


def test_parser_is_stateless_and_long_input_is_not_lost():
    service = ResumeService()
    service.parse(TextInput(raw_text="姓名：甲\n技能：Python"))
    raw = "原始资料" + "未说明。" * 9000
    result = service.parse(TextInput(raw_text=raw))
    assert result.name is None
    assert result.skills == []
    assert result.raw_text == raw


@pytest.fixture
def app(tmp_path):
    return create_app(Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'resume.db'}"))


def test_real_default_preview_edit_save_read_restart(app):
    original = "  姓名：课程样例\r\n技能：Python\r\n项目经历：使用 Python 清洗课程数据\n "
    with TestClient(app) as client:
        assert client.get("/api/v1/modules").json()["resume"] == {"is_mock": False}
        preview = client.post("/api/v1/resumes/preview", json={"raw_text": original})
        assert preview.status_code == 200
        assert preview.headers["x-t5-mock"] == "false"
        assert "id" not in preview.json()
        assert client.get("/api/v1/resumes").json() == []
        edited = {**preview.json(), "name": "用户确认姓名", "skills": ["SQL"], "experience": []}
        saved = client.post("/api/v1/resumes", json=edited)
        assert saved.status_code == 201
        identifier = saved.json()["id"]
        assert saved.json() == {"id": identifier, **edited}
        assert client.get(f"/api/v1/resumes/{identifier}").json() == saved.json()
    with TestClient(app) as client:
        reread = client.get(f"/api/v1/resumes/{identifier}")
        assert reread.json() == saved.json()
        assert reread.json()["raw_text"] == original
        next_version = client.post("/api/v1/resumes", json={**edited, "name": "新版本"}).json()
        assert next_version["id"] != identifier
        assert client.get(f"/api/v1/resumes/{identifier}").json() == saved.json()
        latest = client.get("/api/v1/resumes?order=desc&limit=1").json()
        assert latest == [next_version]
        assert client.get("/api/v1/resumes?order=desc&limit=1&offset=1").json() == [saved.json()]
        assert client.get("/api/v1/resumes?order=wrong").status_code == 422


@pytest.mark.parametrize("path", ["preview", "parse"])
@pytest.mark.parametrize("raw", [" \r\n\t ", "x" * 50001], ids=["blank", "too-long"])
def test_invalid_input_does_not_persist_or_echo(path, raw, app):
    with TestClient(app) as client:
        response = client.post(f"/api/v1/resumes/{path}", json={"raw_text": raw})
        assert response.status_code == 422
        assert "input" not in str(response.json().get("error", {}).get("details"))
        assert client.get("/api/v1/resumes").json() == []


@pytest.mark.parametrize("path", ["preview", "parse"])
def test_provider_failure_or_source_rewrite_is_rejected(path, app):
    class Rewrites:
        def parse(self, data):
            return ResumeData(raw_text="made up")

    class Fails:
        def parse(self, data):
            raise RuntimeError("private resume content")

    with TestClient(app) as client:
        for service in (Rewrites(), Fails()):
            app.state.providers["resume"] = Provider(service, False)
            response = client.post(f"/api/v1/resumes/{path}", json={"raw_text": "original"})
            assert response.status_code == 502
            assert "private" not in response.text
            assert client.get("/api/v1/resumes").json() == []


def test_preview_mock_is_explicit_and_parse_endpoint_remains_compatible():
    settings = Settings(_env_file=None, database_url="sqlite:///:memory:", resume_provider="mock")
    with TestClient(create_app(settings)) as client:
        draft = client.post("/api/v1/resumes/preview", json={"raw_text": " demo "})
        assert draft.status_code == 200
        assert draft.headers["x-t5-mock"] == "true"
        assert draft.json()["raw_text"] == " demo "
        parsed = client.post("/api/v1/resumes/parse", json={"raw_text": " demo "})
        assert parsed.status_code == 201
        assert parsed.json()["id"].startswith("resume_")


def test_match_receives_edited_fields_without_reparsing_original(app):
    class Observes:
        def match(self, resume, jd):
            assert resume.skills == ["SQL"]
            assert resume.raw_text == "技能：Python"
            return {
                "resume_id": resume.id,
                "jd_id": jd.id,
                "score": 0,
                "matched_skills": [],
                "missing_skills": [],
                "gap_analysis": [],
            }

    with TestClient(app) as client:
        draft = client.post("/api/v1/resumes/preview", json={"raw_text": "技能：Python"}).json()
        resume = client.post("/api/v1/resumes", json={**draft, "skills": ["SQL"]}).json()
        jd = client.post("/api/v1/jobs", json={"title": "demo", "jd_text": "SQL"}).json()
        app.state.providers["jobs"] = Provider(Observes(), False)
        response = client.post(
            "/api/v1/matches", json={"resume_id": resume["id"], "jd_id": jd["id"]}
        )
        assert response.status_code == 201
