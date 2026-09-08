"""A product surfaces against real PostgreSQL, isolated from saved user records."""

import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.market_samples import import_sample_jobs
from backend.core.providers import load_provider
from backend.main import create_app
from backend.models.entities import JDRow
from tests.core.test_vectors import pg_engine as core_pg_engine


@pytest.fixture
def pg_engine():
    yield from core_pg_engine.__wrapped__()


@contextmanager
def api_on(engine):
    app = create_app(Settings(_env_file=None, database_url="sqlite://"))
    with TestClient(app) as client:
        original = app.state.engine
        app.state.engine = engine
        try:
            yield client
        finally:
            app.state.engine = original


def test_confirmed_resume_rereads_after_restart_and_drives_real_keyword_match(pg_engine):
    root = Path(__file__).resolve().parents[2]
    raw = json.loads(
        (root / "data/holdout/2026-09-08/resumes/student-03.json").read_text(encoding="utf-8")
    )["raw_text"]
    with api_on(pg_engine) as client:
        draft = client.post("/api/v1/resumes/preview", json={"raw_text": raw})
        assert draft.status_code == 200
        assert draft.json()["skills"] == ["Python"] and len(draft.json()["experience"]) == 10
        edited = {**draft.json(), "name": "Explicit test edit", "skills": ["SQL"], "experience": []}
        saved = client.post("/api/v1/resumes", json=edited)
        assert saved.status_code == 201
        identifier = saved.json()["id"]
        # Re-parsing the raw text cannot update a saved, confirmed version.
        assert client.post("/api/v1/resumes/preview", json={"raw_text": raw}).json()["skills"] == [
            "Python"
        ]
        assert client.get(f"/api/v1/resumes/{identifier}").json() == {**edited, "id": identifier}
    with api_on(pg_engine) as client:
        assert client.get(f"/api/v1/resumes/{identifier}").json() == {**edited, "id": identifier}
        jd = client.post(
            "/api/v1/jobs",
            json={
                "title": "Synthetic pairing fixture",
                "jd_text": "Python SQL",
                "source_type": "synthetic",
            },
        )
        match = client.post(
            "/api/v1/matches", json={"resume_id": identifier, "jd_id": jd.json()["id"]}
        )
        assert match.status_code == 201
        assert match.json()["score"] == 50
        assert match.json()["matched_skills"] == ["SQL"]
        assert match.json()["missing_skills"] == ["Python"]
        assert match.json()["is_mock"] is False
        assert client.get("/api/v1/matches/" + match.json()["id"]).json() == match.json()


def test_five_real_jds_and_unit_isolation_persist_in_postgres(pg_engine):
    with api_on(pg_engine) as client:
        imported = client.post("/api/v1/analytics/sample-jobs")
        assert imported.status_code == 200 and imported.json()["created"] == 5
        for currency, period in (("CNY", "month"), ("USD", "month"), ("CNY", "year")):
            response = client.post(
                "/api/v1/jobs",
                json={
                    "title": f"Synthetic {currency}/{period}",
                    "jd_text": "Python SQL",
                    "source_type": "synthetic",
                    "salary_min": 100,
                    "salary_max": 200,
                    "currency": currency,
                    "salary_period": period,
                },
            )
            assert response.status_code == 201
    with api_on(pg_engine) as client:
        real = client.get("/api/v1/analytics?source_type=real").json()
        assert real["is_mock"] is False and real["market"]["sample_size"] == 5
        assert real["market"]["salary_coverage"]["missing_range_count"] == 5
        assert real["market"]["salary_groups"] == []
        all_jobs = client.get("/api/v1/analytics").json()
        groups = all_jobs["market"]["salary_groups"]
        assert {(group["currency"], group["period"]) for group in groups} == {
            ("CNY", "month"),
            ("USD", "month"),
            ("CNY", "year"),
        }
        assert all(group["sample_size"] == 1 for group in groups)
        assert client.post("/api/v1/analytics/sample-jobs").json()["existing"] == 5


def test_concurrent_snapshot_import_does_not_inflate_market_sample_size(pg_engine):
    provider = load_provider("jobs", Settings(_env_file=None).jobs_provider)

    def run():
        with Session(pg_engine) as session, session.begin():
            return import_sample_jobs(session, provider)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: run(), range(2)))
    assert sorted(result.created for result in results) == [0, 5]
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(JDRow)) == 5
