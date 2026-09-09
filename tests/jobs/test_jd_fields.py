import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JDInput


@pytest.mark.parametrize(
    "text,low,high,currency,period",
    [
        ("薪资：人民币 10–15K/月", 10000, 15000, "CNY", "month"),
        ("Salary: USD 80,000-120,000 per year", 80000, 120000, "USD", "year"),
        ("Salary: € 15–20 / hour", 15, 20, "EUR", "hour"),
        ("年薪：CNY 20-30万", 200000, 300000, "CNY", "year"),
        ("薪资：10-15K", 10000, 15000, None, None),
        ("Salary: $ 20-30 per hour", 20, 30, None, "hour"),
        ("月薪：人民币 10K-15000", 10000, 15000, "CNY", "month"),
    ],
)
def test_explicit_salary_range(text, low, high, currency, period):
    jd = JobsService().parse(JDInput(title="test", jd_text=text))
    assert jd.salary == text
    assert (jd.salary_min, jd.salary_max, jd.currency, jd.salary_period) == (
        low,
        high,
        currency,
        period,
    )


@pytest.mark.parametrize(
    "text",
    [
        "Python Docker",
        "Learning budget USD 2,000 per year",
        "Salary bonus budget USD 100-200",
        "Salary depends on experience",
        "Salary review every 1-2 years",
        "Salary: USD -10-20 per hour",
        "Salary: 10-20% increase",
        "Salary: USD 10-20 per hour\nSalary: EUR 20-30 per hour",
    ],
)
def test_unknown_salary_remains_null(text):
    jd = JobsService().parse(JDInput(title="test", jd_text=text))
    assert all(
        getattr(jd, key) is None
        for key in ("salary", "salary_min", "salary_max", "currency", "salary_period")
    )


def test_invalid_range_not_guessed_and_tools_do_not_change_denominator():
    raw = "  Python、Docker。无需 Java。\n月薪：CNY 20K-10K  "
    jd = JobsService().parse(
        JDInput(title="test", jd_text="test").model_copy(update={"jd_text": raw})
    )
    assert jd.jd_text == raw
    assert jd.skills == jd.tools == ["Docker", "Python"]
    assert jd.salary_min is jd.salary_max is None


def test_confirmed_http_fields_override_parser(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            database_url=f"sqlite:///{tmp_path / 'fields.db'}",
            jobs_provider="backend.modules.jobs.public:JobsService",
        )
    )
    with TestClient(app) as client:
        payload = {
            "title": "test",
            "jd_text": "Python Docker\n薪资：CNY 10-15K/月",
            "tools": [],
            "skills": ["SQL"],
            "salary": None,
            "salary_min": 1,
            "salary_max": 2,
            "currency": "USD",
            "salary_period": "hour",
        }
        response = client.post("/api/v1/jobs", json=payload)
        assert response.status_code == 201
        saved = response.json()
        for key, value in payload.items():
            assert saved[key] == value
        assert client.get("/api/v1/jobs/" + saved["id"]).json() == saved
