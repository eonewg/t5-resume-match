import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.core.config import Settings
from backend.main import create_app
from backend.modules.jobs.keywords import extract
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JD, JDInput, Resume


def pair(have, need):
    return (
        Resume(id="r", raw_text="保留简历原文", skills=have),
        JD(id="j", title="数据岗位", jd_text="保留 JD 原文", skills=need),
    )


@pytest.mark.parametrize(
    "have,need,score,missing",
    [
        (["Python", "SQL"], ["Python", "SQL"], 100, []),
        (["Python"], ["Python", "SQL"], 50, ["SQL"]),
        (["Excel"], ["Python", "SQL"], 0, ["Python", "SQL"]),
        (["python", "sql"], ["PYTHON", "sQl"], 100, []),
        (["python", "Python"], ["Python", "python", "SQL"], 50, ["SQL"]),
        (["K8s", "sklearn"], ["Kubernetes", "scikit-learn"], 100, []),
        (["MySQL"], ["SQL"], 0, ["SQL"]),
        ([], ["SQL"], 0, ["SQL"]),
        (["Python"], [], 0, []),
        (["私有工具"], ["私有工具"], 100, []),
    ],
)
def test_matching(have, need, score, missing):
    resume, jd = pair(have, need)
    before = copy.deepcopy((resume.model_dump(), jd.model_dump()))
    result = JobsService().match(resume, jd)
    assert result.score == score
    assert result.missing_skills == missing
    assert len(result.matched_skills) + len(missing) == len(set(x.casefold() for x in need))
    assert (resume.model_dump(), jd.model_dump()) == before
    assert result.resume_id == "r" and result.jd_id == "j"
    if not need:
        assert "无法有效评估" in result.gap_analysis[0]


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Python、SQL、Docker", ["Docker", "Python", "SQL"]),
        ("javascript mysql report cargo", ["JavaScript", "MySQL"]),
        ("SQL Server、C++、C#、R", ["C#", "C++", "R", "SQL Server"]),
        ("Ｋ８Ｓ、sklearn、AB实验", ["A/B测试", "Kubernetes", "scikit-learn"]),
        ("无需Python；熟悉 SQL", ["SQL"]),
        ("未掌握 SQL；熟悉 Python", ["Python"]),
        ("热爱工作，沟通能力好", []),
    ],
)
def test_extraction_boundaries_and_aliases(text, expected):
    assert extract(text) == expected


def test_parse_preserves_original_and_separates_tools():
    data = JDInput.model_construct(
        title=" 岗位 ", company=" 公司 ", jd_text="  掌握 Python，熟悉机器学习。\n"
    )
    original = data.model_dump()
    result = JobsService().parse(data)
    assert all(getattr(result, key) == value for key, value in original.items())
    assert data.model_dump() == original
    detail = JobsService().parse_detail(data)
    assert detail.tools == ("Python",)
    assert detail.skills == ("机器学习",)


@pytest.mark.parametrize(
    "text", ["", " ", None, 123, "x" * 50001], ids=["empty", "blank", "null", "number", "oversized"]
)
def test_invalid_inputs(text):
    with pytest.raises(ValidationError):
        JobsService().parse(JDInput.model_construct(title="岗位", jd_text=text, company=None))
    resume, jd = pair([], ["SQL"])
    resume.raw_text = text
    with pytest.raises(ValidationError):
        JobsService().match(resume, jd)


def test_structured_skills_authoritative_and_large_gap():
    resume, jd = pair([], [])
    resume.raw_text = "Python SQL"
    jd.jd_text = "Python SQL"
    assert JobsService().match(resume, jd).matched_skills == []
    jd.skills = [str(i) + "x" * 190 for i in range(500)]
    result = JobsService().match(resume, jd)
    assert result.score == 0 and len(result.missing_skills) == 500


def test_unseen_jd_composes_terms_without_fixture_lookup():
    parsed = JobsService().parse(JDInput(title="新岗位", jd_text="使用 SQL；研究电气工程。"))
    assert set(parsed.skills) == {"SQL", "电气工程"}


def test_score_gap_consistent_and_monotonic():
    for count in range(7):
        resume, jd = pair([f"tool-{i}" for i in range(count)], [f"tool-{i}" for i in range(6)])
        result = JobsService().match(resume, jd)
        assert result.score == round(100 * min(count, 6) / 6, 2)
        assert set(result.matched_skills).isdisjoint(result.missing_skills)
        assert set(result.matched_skills) | set(result.missing_skills) == set(jd.skills)


def test_public_api_parse_save_select_match_readback():
    settings = Settings(
        _env_file=None,
        database_url="sqlite://",
        jobs_provider="backend.modules.jobs.public:JobsService",
        resume_provider="mock",
    )
    with TestClient(create_app(settings)) as client:
        parsed = client.post(
            "/api/v1/jobs", json={"title": "数据分析", "jd_text": "Python SQL Docker"}
        )
        assert parsed.status_code == 201 and parsed.headers["X-T5-Mock"] == "false"
        jd = parsed.json()
        resume = client.post(
            "/api/v1/resumes", json={"raw_text": "Python", "skills": ["Python"]}
        ).json()
        result = client.post("/api/v1/matches", json={"resume_id": resume["id"], "jd_id": jd["id"]})
        assert result.status_code == 201
        record = result.json()
        assert record["score"] == 33.33 and record["is_mock"] is False
        assert client.get("/api/v1/matches/" + record["id"]).json() == record
        assert client.get("/api/v1/jobs/" + jd["id"]).json() == jd
        assert client.post("/api/v1/jobs", json={"title": "x", "jd_text": " "}).status_code == 422
        assert (
            client.post(
                "/api/v1/matches", json={"resume_id": "missing", "jd_id": jd["id"]}
            ).status_code
            == 404
        )
        mock_resume = client.post("/api/v1/resumes/parse", json={"raw_text": "Python"}).json()
        mock_match = client.post(
            "/api/v1/matches", json={"resume_id": mock_resume["id"], "jd_id": jd["id"]}
        ).json()
        assert mock_match["is_mock"] is True


def test_all_published_jds_parse_without_mutation():
    root = Path(__file__).resolve().parents[2]
    for path in (root / "data/jd").glob("*.json"):
        for row in json.loads(path.read_text(encoding="utf-8")):
            data = JDInput(title=row["title"], company=row["company"], jd_text=row["raw_text"])
            result = JobsService().parse(data)
            assert result.jd_text == data.jd_text and result.title == data.title
            assert len(result.skills) == len(set(result.skills))
