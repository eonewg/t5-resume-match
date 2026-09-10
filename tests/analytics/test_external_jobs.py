"""External feed boundaries; tests never call Jobicy or any AI provider."""

import json
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.core import external_jobs as external
from backend.core.config import Settings
from backend.main import create_app
from backend.models.entities import JDRow


def raw(**changes):
    return {
        "id": 10,
        "url": "https://jobicy.com/jobs/10-synthetic-test",
        "jobTitle": "Synthetic API test",
        "companyName": "Fixture Company",
        "jobDescription": "<p>Build Python services.</p><script>bad()</script><p>Use SQL.</p>",
        "jobGeo": "Anywhere",
        "pubDate": "2026-09-01T12:00:00Z",
        "salaryMin": 50000,
        "salaryMax": 70000,
        "salaryCurrency": "USD",
        "salaryPeriod": "yearly",
        **changes,
    }


def test_source_html_and_salary_are_explicit():
    result = external.to_job(raw(), datetime.now(UTC).date())
    assert "bad()" not in result.jd_text and "<p>" not in result.jd_text
    assert "Python" in result.jd_text and "Published: 2026-09-01" in result.jd_text
    assert (result.salary_min, result.salary_max, result.currency, result.salary_period) == (
        50000,
        70000,
        "USD",
        "year",
    )
    unknown = external.to_job(raw(salaryPeriod=None, salaryCurrency=None), result.collected_at)
    assert unknown.salary_period is None and unknown.currency is None
    zero = external.to_job(
        raw(salaryMin=0, salaryMax=0, salaryPeriod="hourly"), result.collected_at
    )
    assert zero.salary_min == zero.salary_max == 0 and zero.salary_period == "hour"
    for value in [True, float("nan"), -1, "bad"]:
        assert external.to_job(raw(salaryMin=value), result.collected_at).salary_min is None
    for url in ["https://evil.test/jobs/1", "javascript:alert(1)", "https://a@jobicy.com/jobs/1"]:
        with pytest.raises(ValueError):
            external.to_job(raw(url=url), result.collected_at)


def test_cache_and_http_failures(monkeypatch, tmp_path):
    cache = tmp_path / "jobicy.json"
    fetched = datetime.now(UTC).isoformat()
    cache.write_text(json.dumps({"fetched_at": fetched, "jobs": [raw()]}))
    calls = []
    real_client = httpx.Client

    def reply(request):
        calls.append(request)
        return httpx.Response(200, json={"jobs": [raw(id=11)]})

    monkeypatch.setattr(
        external.httpx,
        "Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(reply), **kwargs),
    )
    assert external.fetch_feed(cache)[1] is True and not calls
    cache.write_text(
        json.dumps({"fetched_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(), "jobs": []})
    )
    data, cached = external.fetch_feed(cache)
    assert not cached and data["jobs"][0]["id"] == 11 and len(calls) == 1
    assert external.fetch_feed(cache)[1] and len(calls) == 1
    cache.unlink()
    monkeypatch.setattr(
        external.httpx,
        "Client",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(lambda r: httpx.Response(503)), **kwargs
        ),
    )
    with pytest.raises(HTTPException) as exc:
        external.fetch_feed(cache)
    assert exc.value.status_code == 502 and not cache.exists()


def test_import_is_idempotent_keeps_versions_and_reports_bad_rows(monkeypatch, tmp_path):
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        resume_provider="mock",
        diagnosis_provider="mock",
    )
    feed = {
        "fetched_at": datetime.now(UTC).isoformat(),
        "jobs": [raw(), raw(), raw(id=11, salaryPeriod=None), raw(id=12, url="https://bad.test")],
    }
    monkeypatch.setattr(external, "fetch_feed", lambda: (deepcopy(feed), False))
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/v1/analytics/external-jobs")
        assert response.status_code == 200, response.text
        assert {key: response.json()[key] for key in ("created", "existing", "skipped")} == {
            "created": 2,
            "existing": 0,
            "skipped": 2,
        }
        first = client.get("/api/v1/jobs/jd_jobicy_10").json()
        assert first["salary_period"] == "year" and first["source_type"] == "real"
        assert "Python" in first["skills"]
        feed["jobs"][0]["jobTitle"] = "Changed title must not overwrite saved JD"
        again = client.post("/api/v1/analytics/external-jobs").json()
        assert again["created"] == 0 and again["existing"] == 2
        assert client.get("/api/v1/jobs/jd_jobicy_10").json() == first
        market = client.get("/api/v1/analytics?source_type=real").json()["market"]
        assert market["salary_coverage"] == {
            "comparable_count": 1,
            "missing_range_count": 0,
            "missing_unit_count": 1,
        }
        monkeypatch.setattr(
            external, "fetch_feed", lambda: (_ for _ in ()).throw(HTTPException(502, "offline"))
        )
        assert client.post("/api/v1/analytics/external-jobs").status_code == 502
        assert client.get("/api/v1/jobs/jd_jobicy_10").json() == first
        with Session(client.app.state.engine) as session:
            assert session.get(JDRow, "jd_jobicy_10").is_mock is False


def test_broad_feed_does_not_count_ordinary_go_as_programming_language():
    from backend.core.providers import Provider
    from backend.modules.jobs.public import JobsService

    provider = Provider(JobsService(), False)
    for description in [
        "Lead go-to-market strategy and go above expectations.",
        "Go live with the new sales campaign.",
    ]:
        payload = external.parsed_payload(
            provider, external.to_job(raw(jobDescription=description), datetime.now(UTC).date())
        )
        assert "Go" not in payload["skills"] and "Go" not in payload["tools"]
    for description in [
        "Build services in Golang.",
        "Go programming language",
        "Languages: Go, Python",
        "Our stack (Go, SQL)",
    ]:
        payload = external.parsed_payload(
            provider, external.to_job(raw(jobDescription=description), datetime.now(UTC).date())
        )
        assert "Go" in payload["skills"]
