"""Independently specified counts, salary denominators, and persisted source provenance."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select, update
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.database import build_engine
from backend.core.migrations import migrate, versions
from backend.core.providers import Provider
from backend.models.entities import JDRow
from backend.modules.analytics.public import AnalyticsService
from backend.schemas.contracts import JD, AnalysisResult


def job(identifier, **fields):
    return JD(id=identifier, title=identifier, jd_text="Provided source text", **fields)


def test_incidence_deduplicates_per_job_and_never_adds_tools_or_inferred_skills():
    result = AnalyticsService().analyze(
        [
            job("a", skills=["Python", "python", "ＳＱＬ"], tools=["Docker", "Python"]),
            job("b", skills=["SQL", "Python"]),
            job("c", skills=[], tools=["Python"]),
        ]
    )
    assert result.skills == {"Python": 2, "ＳＱＬ": 2}
    assert [(row.job_count, row.share_percent) for row in result.market.skill_frequency] == [
        (2, 66.67),
        (2, 66.67),
    ]
    assert result.market.sample_size == 3
    assert result.market.jobs[-1].skills == []
    assert result.market.source_counts["unknown"] == 3


def test_salary_ranges_are_partitioned_not_converted_or_zero_imputed():
    jobs = [
        job("cny-month", salary_min=10000, salary_max=20000, currency="CNY", salary_period="month"),
        job("cny-year", salary_min=120000, salary_max=240000, currency="CNY", salary_period="year"),
        job("usd-month", salary_min=5000, salary_max=6000, currency="USD", salary_period="month"),
        job("eur-hour", salary_min=15, salary_max=20, currency="EUR", salary_period="hour"),
        job("unknown"),
        job("one-sided", salary_min=10000, currency="CNY", salary_period="month"),
        job("bare-dollar", salary_min=10, salary_max=20, currency="$", salary_period="hour"),
        job("no-period", salary_min=10, salary_max=20, currency="USD"),
        job("explicit-zero", salary_min=0, salary_max=0, currency="cny", salary_period="month"),
    ]
    result = AnalyticsService().analyze(jobs).market
    assert result.salary_coverage.model_dump() == {
        "comparable_count": 5,
        "missing_range_count": 2,
        "missing_unit_count": 2,
    }
    groups = {(group.currency, group.period): group for group in result.salary_groups}
    assert len(groups) == 4
    assert [(row.lower, row.upper) for row in groups["CNY", "month"].ranges] == [
        (10000, 20000),
        (0, 0),
    ]
    assert groups["CNY", "year"].ranges[0].upper == 240000
    assert groups["EUR", "hour"].ranges[0].upper == 20
    assert sum(group.sample_size for group in groups.values()) == 5
    assert sum(result.salary_coverage.model_dump().values()) == len(jobs)


def test_empty_and_missing_sources_remain_explicit():
    market = AnalyticsService().analyze([]).market
    assert market.sample_size == 0
    assert market.skill_frequency == market.jobs == market.salary_groups == []
    assert market.collected_from is market.collected_to is None
    market = (
        AnalyticsService()
        .analyze(
            [
                job("a", company="Example", collected_at="2026-09-07"),
                job("b", company=" example ", collected_at="2026-09-08"),
                job("c"),
            ]
        )
        .market
    )
    assert market.company_count == 1 and market.unknown_company_count == 1
    assert market.undated_count == 1
    assert market.collected_from == date(2026, 9, 7)
    assert market.collected_to == date(2026, 9, 8)
    assert any("不能外推" in value for value in market.observations)


@pytest.fixture
def client(tmp_path):
    from backend.main import create_app

    with TestClient(
        create_app(Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'analytics.db'}"))
    ) as api:
        yield api


def test_real_snapshot_import_is_repeatable_persisted_and_source_bounded(client):
    assert client.get("/api/v1/analytics?source_type=real").json()["market"]["sample_size"] == 0
    imported = client.post("/api/v1/analytics/sample-jobs")
    assert imported.status_code == 200
    assert imported.json()["created"] == 5 and imported.json()["existing"] == 0
    again = client.post("/api/v1/analytics/sample-jobs")
    assert again.json() == {**imported.json(), "created": 0, "existing": 5}
    jobs = client.get("/api/v1/jobs").json()
    assert len(jobs) == 5
    assert len({row["source_url"] for row in jobs}) == 5
    assert all(row["source_type"] == "real" and row["collected_at"] == "2026-09-08" for row in jobs)
    result = client.get("/api/v1/analytics?source_type=real").json()
    assert result["is_mock"] is False
    assert result["market"]["sample_size"] == result["scope"]["selected_count"] == 5
    assert result["market"]["company_count"] == 1
    assert result["market"]["salary_coverage"] == {
        "comparable_count": 0,
        "missing_range_count": 5,
        "missing_unit_count": 0,
    }
    # Reconcile to the actual saved structured fields, not to a copied parser algorithm.
    assert result["skills"]["Python"] == sum("Python" in row["skills"] for row in jobs)
    assert result["market"]["salary_groups"] == []
    assert client.get("/api/v1/analytics?date_to=2026-09-07").json()["market"]["sample_size"] == 0


def test_filters_are_global_and_undated_records_do_not_gain_a_date(client):
    client.post("/api/v1/analytics/sample-jobs")
    created = client.post(
        "/api/v1/jobs",
        json={
            "title": "Explicit synthetic salary fixture",
            "jd_text": "Python SQL",
            "skills": ["PrivateFixtureSkill"],
            "source_type": "synthetic",
            "salary_min": 100,
            "salary_max": 200,
            "currency": "USD",
            "salary_period": "hour",
        },
    )
    assert created.status_code == 201
    real = client.get("/api/v1/analytics?source_type=real").json()
    assert real["scope"]["available_count"] == 6
    assert "PrivateFixtureSkill" not in real["skills"]
    assert real["market"]["salary_groups"] == []
    synth = client.get("/api/v1/analytics?source_type=synthetic").json()
    assert synth["market"]["sample_size"] == 1 and synth["market"]["undated_count"] == 1
    assert synth["market"]["salary_groups"][0]["currency"] == "USD"
    assert (
        client.get("/api/v1/analytics?source_type=synthetic&date_from=2026-01-01").json()["market"][
            "sample_size"
        ]
        == 0
    )
    assert (
        client.get("/api/v1/analytics?date_from=2026-09-08&date_to=2026-09-07").status_code == 422
    )
    assert client.get("/api/v1/analytics?source_type=wrong").status_code == 422


@pytest.mark.parametrize(
    "metadata",
    [
        {"source_type": "real"},
        {"source_url": "javascript:alert(1)"},
        {"source_url": "https://user:password@example.org"},
        {"collected_at": "not-a-date"},
    ],
)
def test_invalid_provenance_is_rejected(client, metadata):
    response = client.post("/api/v1/jobs", json={"title": "fixture", "jd_text": "SQL", **metadata})
    assert response.status_code == 422
    assert client.get("/api/v1/jobs").json() == []


def test_mock_rows_cannot_be_counted_as_real_and_old_analysis_port_still_works(client):
    client.post("/api/v1/analytics/sample-jobs")
    with Session(client.app.state.engine) as session, session.begin():
        identifier = session.scalar(select(JDRow.id))
        session.execute(update(JDRow).where(JDRow.id == identifier).values(is_mock=True))
    real = client.get("/api/v1/analytics?source_type=real").json()
    assert real["market"]["sample_size"] == 4
    assert real["scope"]["excluded_mock_count"] == 1 and real["is_mock"] is False
    assert client.get("/api/v1/analytics").json()["is_mock"] is True

    class Legacy:
        def analyze(self, jobs):
            return AnalysisResult(summary="Legacy fixture", skills={})

    client.app.state.providers["analytics"] = Provider(Legacy(), False)
    result = client.get("/api/v1/analytics?source_type=real")
    assert result.status_code == 200 and result.json()["market"] is None


def test_source_migration_upgrades_existing_version_two_without_changing_values(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'old-source.db'}")
    JDRow.__table__.create(engine)
    versions.create(engine)
    old = {"title": "old", "jd_text": "SQL", "skills": ["SQL"], "salary_min": 5}
    with engine.begin() as connection:
        connection.execute(insert(versions), [{"version": 1}, {"version": 2}])
    with Session(engine) as session, session.begin():
        session.add(JDRow(id="old", payload=old, is_mock=True))
    migrate(engine)
    migrate(engine)
    with Session(engine) as session:
        row = session.get(JDRow, "old")
        assert row.is_mock is True
        assert all(row.payload[key] == value for key, value in old.items())
        assert row.payload["source_type"] == "unknown" and row.payload["collected_at"] is None
    engine.dispose()
