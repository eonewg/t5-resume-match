import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.providers import Provider
from backend.main import create_app
from backend.models.entities import DiagnosisRow, MatchRow


@pytest.fixture
def app(tmp_path):
    return create_app(Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'test.db'}"))


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


def pair(client):
    resume = client.post("/api/v1/resumes/parse", json={"raw_text": "Python 项目经历"})
    job = client.post("/api/v1/jobs", json={"title": "分析师", "jd_text": "Python SQL"})
    assert resume.status_code == job.status_code == 201
    assert resume.headers["x-t5-mock"] == "true"
    return {"resume_id": resume.json()["id"], "jd_id": job.json()["id"]}


def test_full_workflow_and_restart(app):
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/ready").status_code == 503
        assert len(client.get("/api/v1/modules").json()) == 4
        ids = pair(client)
        response = client.post("/api/v1/workflow", json=ids)
        assert response.status_code == 201
        result = response.json()
        assert result["match"]["resume_id"] == ids["resume_id"]
        assert result["match"]["is_mock"] is True
        assert result["diagnosis"]["is_mock"] is True
        assert client.get("/api/v1/analytics").json()["is_mock"] is True
        assert client.get("/api/v1/jobs?limit=1&offset=1").json() == []
    with TestClient(app) as client:
        assert client.get("/api/v1/resumes/" + ids["resume_id"]).status_code == 200
        for path, key in [("matches", "match"), ("diagnoses", "diagnosis")]:
            assert client.get(f"/api/v1/{path}/" + result[key]["id"]).json() == result[key]


@pytest.mark.parametrize(
    "payload",
    [{"raw_text": "  "}, {"raw_text": "x", "secret": "private"}, {"raw_text": "x" * 50001}, {}],
)
def test_invalid_input_does_not_leak_or_persist(client, payload):
    response = client.post("/api/v1/resumes/parse", json=payload)
    assert response.status_code == 422
    assert "private" not in response.text
    assert client.get("/api/v1/resumes").json() == []


def test_missing_records_and_pagination(client):
    assert client.get("/api/v1/resumes/unknown").status_code == 404
    assert client.get("/api/v1/jobs?limit=101").status_code == 422
    response = client.post("/api/v1/workflow", json={"resume_id": "x", "jd_id": "y"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "404"


def test_provider_failure_rolls_back_workflow(client, app):
    ids = pair(client)

    class Broken:
        def diagnose(self, data):
            raise RuntimeError("secret-token and resume text")

    app.state.providers["diagnosis"] = Provider(Broken(), False)
    response = client.post("/api/v1/workflow", json=ids)
    assert response.status_code == 502
    assert "secret-token" not in response.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MatchRow)) == 0
        assert session.scalar(select(func.count()).select_from(DiagnosisRow)) == 0


@pytest.mark.parametrize("score,wrong_id", [(101, False), (30, True)])
def test_invalid_module_contract(client, app, score, wrong_id):
    ids = pair(client)

    class InvalidJobs:
        def match(self, resume, jd):
            return {
                "resume_id": "wrong" if wrong_id else resume.id,
                "jd_id": jd.id,
                "score": score,
                "matched_skills": [],
                "missing_skills": [],
                "gap_analysis": [],
            }

    app.state.providers["jobs"] = Provider(InvalidJobs(), False)
    assert client.post("/api/v1/matches", json=ids).status_code == 502


def test_public_plugin_loading_and_real_mode(tmp_path, monkeypatch):
    # Real import boundary, no dependency on business module internals.
    plugin = tmp_path / "public_plugin.py"
    plugin.write_text("""
from backend.core.mocks import MockResume, MockJobs, MockDiagnosis, MockAnalytics
class ResumeService(MockResume): pass
class JobsService(MockJobs): pass
class DiagnosisService(MockDiagnosis): pass
class AnalyticsService(MockAnalytics): pass
""")
    monkeypatch.syspath_prepend(str(tmp_path))
    settings = Settings(
        _env_file=None,
        database_url="sqlite:///:memory:",
        resume_provider="public_plugin:ResumeService",
        jobs_provider="public_plugin:JobsService",
        diagnosis_provider="public_plugin:DiagnosisService",
        analytics_provider="public_plugin:AnalyticsService",
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/ready").status_code == 200
        assert all(not p["is_mock"] for p in client.get("/api/v1/modules").json().values())
        resume = client.post("/api/v1/resumes/parse", json={"raw_text": "demo"}).json()
        jd = client.post("/api/v1/jobs", json={"title": "dev", "jd_text": "demo"}).json()
        response = client.post(
            "/api/v1/workflow", json={"resume_id": resume["id"], "jd_id": jd["id"]}
        )
        assert response.status_code == 201
        assert response.json()["match"]["is_mock"] is False


def test_misconfigured_provider_fails_startup():
    with pytest.raises(ValueError, match="module:Class"):
        with TestClient(create_app(Settings(_env_file=None, resume_provider="bad"))):
            pass


def test_foreign_keys_are_enforced(client, app):
    with Session(app.state.engine) as session:
        session.add(MatchRow(id="invalid", resume_id="missing", jd_id="missing", payload={}))
        with pytest.raises(IntegrityError):
            session.commit()


def test_structured_resume_and_individual_routes(client):
    resume = client.post("/api/v1/resumes", json={"raw_text": "original", "skills": ["SQL"]})
    assert resume.status_code == 201
    assert resume.headers["x-t5-mock"] == "false"
    jd = client.post("/api/v1/jobs", json={"title": "dev", "jd_text": "SQL"}).json()
    ids = {"resume_id": resume.json()["id"], "jd_id": jd["id"]}
    for path in ("matches", "diagnoses"):
        result = client.post("/api/v1/" + path, json=ids)
        assert result.status_code == 201
        assert result.json()["is_mock"] is True
    assert client.get("/openapi.json").status_code == 200
