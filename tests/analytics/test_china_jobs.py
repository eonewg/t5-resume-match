"""NCSS source contract using only synthetic fixtures and mocked HTTP."""

from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.core import china_jobs as china
from backend.core.config import Settings
from backend.main import create_app


def row(**changes):
    return {
        "jobId": "Synthetic123",
        "jobName": "合成测试 Python 工程师",
        "recName": "合成测试公司",
        "description": "使用 Python 和 SQL 开发服务",
        "lowMonthPay": 8,
        "highMonthPay": 15,
        **changes,
    }


def test_salary_units_negotiable_and_source():
    job = china.to_job(row(), datetime.now(UTC).date())
    assert (job.salary_min, job.salary_max, job.currency, job.salary_period) == (
        8000,
        15000,
        "CNY",
        "month",
    )
    assert job.source_url.endswith("/Synthetic123/detail.html")
    for low, high in [(0, 0), (0, 15), (10, 5), (None, 10)]:
        value = china.to_job(row(lowMonthPay=low, highMonthPay=high), job.collected_at)
        assert value.salary_min is None and value.salary_max is None
    for bad in ["../secret", "https://elsewhere.test", None]:
        with pytest.raises(ValueError):
            china.to_job(row(jobId=bad), job.collected_at)
    with pytest.raises(ValueError):
        china.to_job(row(description=""), job.collected_at)


def test_detail_cache_and_partial_failure(monkeypatch, tmp_path):
    calls = []
    original = httpx.Client

    def reply(request):
        calls.append(str(request.url))
        if "ajax" in str(request.url):
            return httpx.Response(
                200, json={"flag": True, "data": {"list": [row(), row(jobId="Failed123")]}}
            )
        if "Failed123" in str(request.url):
            return httpx.Response(503)
        return httpx.Response(
            200,
            text='<header>unrelated</header><pre class="mainContent mainContent">Use Python<br>SQL</pre>',
        )

    monkeypatch.setattr(
        china.httpx,
        "Client",
        lambda **kwargs: original(transport=httpx.MockTransport(reply), **kwargs),
    )
    feed, cached = china.fetch_feed(tmp_path / "ncss.json")
    assert not cached and len(calls) == 3
    assert feed["jobs"][0]["description"] == "Use Python\nSQL"
    assert feed["jobs"][1]["description"] == ""
    assert china.fetch_feed(tmp_path / "ncss.json")[1] and len(calls) == 3


def test_source_dispatch_dedup_and_real_analytics(monkeypatch, tmp_path):
    feed = {
        "fetched_at": datetime.now(UTC).isoformat(),
        "jobs": [
            row(),
            row(jobId="Negotiable123", lowMonthPay=0, highMonthPay=0),
            row(jobId="Missing123", description=""),
        ],
    }
    monkeypatch.setattr(china, "fetch_feed", lambda: (feed, True))
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite:///{tmp_path / 'china.db'}",
        resume_provider="mock",
        diagnosis_provider="mock",
    )
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/v1/analytics/external-jobs?source=ncss")
        assert response.status_code == 200, response.text
        data = response.json()
        assert (data["created"], data["existing"], data["skipped"]) == (2, 0, 1)
        assert data["source"] == "国家大学生就业服务平台"
        assert client.post("/api/v1/analytics/external-jobs?source=ncss").json()["existing"] == 2
        market = client.get("/api/v1/analytics?source_type=real").json()["market"]
        assert market["sample_size"] == 2
        assert market["salary_coverage"]["comparable_count"] == 1
        assert market["salary_groups"][0]["currency"] == "CNY"
        assert client.post("/api/v1/analytics/external-jobs?source=other").status_code == 422
