"""Backwards-compatible JD persistence, migration and real Level 1 public chain."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.database import build_engine
from backend.core.migrations import migrate, versions
from backend.core.providers import Provider
from backend.main import create_app
from backend.models.entities import JDRow
from backend.schemas.contracts import JDData, JDInput


@pytest.fixture
def app(tmp_path):
    return create_app(
        Settings(
            _env_file=None,
            resume_provider="backend.modules.resume.public:OfflineResumeService",
            database_url=f"sqlite:///{tmp_path / 'jd.db'}",
        )
    )


def test_legacy_provider_and_optional_metadata_round_trip(app):
    class Legacy:
        def parse(self, data):
            assert type(data) is JDInput
            assert set(data.model_dump()) == {"title", "company", "jd_text"}
            return JDData(**data.model_dump(), skills=["Python"])

    with TestClient(app) as client:
        app.state.providers["jobs"] = Provider(Legacy(), False)
        original = {
            "title": "Analyst",
            "jd_text": "Python SQL",
            "skills": ["SQL"],
            "tools": ["SQL"],
            "salary": "  € 15–20 / hour (negotiable)  ",
            "salary_min": 15,
            "salary_max": 20,
            "currency": "EUR",
            "salary_period": "hour",
        }
        response = client.post("/api/v1/jobs", json=original)
        assert response.status_code == 201
        saved = response.json()
        for key, value in original.items():
            assert saved[key] == value
        empty = client.post(
            "/api/v1/jobs", json={"title": "x", "jd_text": "Python", "skills": [], "salary": None}
        ).json()
        assert empty["skills"] == [] and empty["salary_min"] is None
    with TestClient(app) as client:
        assert client.get("/api/v1/jobs/" + saved["id"]).json() == saved
        assert client.get("/api/v1/jobs").json()[0] == saved


@pytest.mark.parametrize(
    "fields",
    [
        {"salary_min": -1},
        {"salary_min": 20, "salary_max": 10},
        {"salary_max": "NaN"},
        {"currency": ""},
        {"unknown_field": "x"},
    ],
)
def test_invalid_metadata_is_rejected_without_persistence(app, fields):
    with TestClient(app) as client:
        response = client.post("/api/v1/jobs", json={"title": "x", "jd_text": "SQL", **fields})
        assert response.status_code == 422
        assert client.get("/api/v1/jobs").json() == []


def test_existing_jd_migration_is_additive_and_repeatable(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    JDRow.__table__.create(engine)
    old = {"title": "legacy", "company": None, "jd_text": "Python", "skills": ["Python"]}
    with Session(engine) as session, session.begin():
        session.add(JDRow(id="jd_legacy", payload=old, is_mock=True))
    migrate(engine)
    migrate(engine)
    with Session(engine) as session:
        row = session.get(JDRow, "jd_legacy")
        assert row.is_mock is True
        assert all(row.payload[k] == v for k, v in old.items())
        assert row.payload["tools"] == [] and row.payload["salary"] is None
        assert row.payload["source_type"] == "unknown"
        assert row.payload["source_url"] is None and row.payload["collected_at"] is None
        assert list(session.scalars(select(versions.c.version).order_by(versions.c.version))) == [
            1,
            2,
            5,
        ]
    engine.dispose()


def test_real_resume_to_jd_to_keyword_match(app):
    with TestClient(app) as client:
        assert client.get("/api/v1/modules").json()["jobs"] == {"is_mock": False}
        original = "  技能：Python、SQL\n项目经历：使用 Python 清洗课程数据。\n "
        draft = client.post("/api/v1/resumes/preview", json={"raw_text": original}).json()
        resume = client.post("/api/v1/resumes", json={**draft, "skills": ["SQL"]}).json()
        jd_response = client.post(
            "/api/v1/jobs", json={"title": "Analyst", "jd_text": "Python SQL Docker"}
        )
        assert jd_response.status_code == 201 and jd_response.headers["x-t5-mock"] == "false"
        jd = jd_response.json()
        assert (
            jd["salary"] is None
            and jd["salary_min"] is None
            and jd["tools"] == ["Docker", "Python", "SQL"]
        )
        result = client.post("/api/v1/matches", json={"resume_id": resume["id"], "jd_id": jd["id"]})
        assert result.status_code == 201
        match = result.json()
        assert match["score"] == 33.33 and match["matched_skills"] == ["SQL"]
        assert set(match["missing_skills"]) == {"Python", "Docker"} and match["is_mock"] is False
        assert client.get("/api/v1/resumes/" + resume["id"]).json()["raw_text"] == original
        assert client.get("/api/v1/matches/" + match["id"]).json() == match
