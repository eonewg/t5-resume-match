from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.providers import load_provider
from backend.models.entities import JDRow
from backend.modules.analytics.public import AnalyticsService
from backend.schemas.contracts import JD
from scripts.import_final_samples import import_samples
from scripts.summarize_ai_evaluation import preserve_submission, summarize
from tests.core.test_vectors import pg_engine  # noqa: F401


def test_final_market_sources_persist_without_guessing_salary_period(pg_engine):  # noqa: F811
    provider = load_provider("jobs", "backend.modules.jobs.public:JobsService")
    with Session(pg_engine) as session, session.begin():
        assert import_samples(session, provider)["created"] == 5
    with Session(pg_engine) as session, session.begin():
        assert import_samples(session, provider)["created"] == 0
        rows = list(session.scalars(select(JDRow)))
        jobs = [JD(id=row.id, **row.payload) for row in rows]
        result = AnalyticsService().analyze(jobs).market
        assert result.sample_size == 5 and result.company_count == 5
        assert result.salary_coverage.comparable_count == 4
        assert result.salary_coverage.missing_unit_count == 1
        assert result.salary_groups[0].currency == "USD"
        assert result.salary_groups[0].period == "year"
        scale = next(row for row in jobs if row.company == "Scale AI")
        assert scale.salary_min == 124000 and scale.salary_period is None


def test_judge_summary_separates_failure_and_uses_blind_mapping():
    record = {
        "input_sha256": "fixture",
        "predictions": [{"score": i} for i in range(15)],
        "diagnosis_cases": [
            {
                "id": "D1",
                "status": "completed",
                "result": {"star_rewrites": [{"optimized": "synthetic fixture"}]},
                "candidate_mapping": {"A": "original", "B": "model"},
            },
            {
                "id": "D2",
                "status": "completed",
                "result": {"star_rewrites": [{"optimized": "synthetic fixture"}]},
                "candidate_mapping": {"A": "model", "B": "original"},
            },
            {"id": "D3", "status": "failed", "candidate_mapping": {"A": "model", "B": "original"}},
        ],
    }
    ids = (
        [f"P{i}" for i in range(1, 4)]
        + [f"M{i:02d}" for i in range(1, 16)]
        + [f"D{i}" for i in range(1, 4)]
    )
    submission = {
        "input_sha256": "fixture",
        "reviewer": "test fixture only",
        "ratings": {
            key: {"score": 3, "scoreB": 5, "notes": "Synthetic test evidence"} for key in ids
        },
    }
    submission["ratings"]["D3"]["score"] = ""
    result = summarize(submission, record)
    assert result["evaluation_kind"] == "independent_ai_blind_review"
    assert result["diagnosis_attempted_cases"] == 3
    assert result["diagnosis_failed_cases"] == 1
    assert result["diagnosis_completed_cases"] == 2
    assert result["rewrite_mean_delta_among_available"] == 0
    assert result["rewrite_improved_count"] == 1
    assert result["keyword_vs_judge_spearman"] is None
    for case in record["diagnosis_cases"][:2]:
        case["result"]["star_rewrites"] = []
    empty = summarize(submission, record)
    assert empty["diagnosis_completed_cases"] == 2
    assert empty["rewrite_empty_completed_cases"] == 2
    assert empty["rewrite_available_cases"] == 0
    assert empty["rewrite_mean_delta_among_available"] is None
    import pytest

    del submission["ratings"]["D3"]
    with pytest.raises(ValueError, match="D3"):
        summarize(submission, record)
    submission["input_sha256"] = "other"
    with pytest.raises(ValueError, match="版本"):
        summarize(submission, record)


def test_judge_original_is_preserved_byte_for_byte(tmp_path):
    import hashlib

    import pytest

    source, target = tmp_path / "received.json", tmp_path / "archive/reviewer-ai.json"
    raw = b'{"fixture":true}\r\n'
    source.write_bytes(raw)
    assert preserve_submission(source, target) == hashlib.sha256(raw).hexdigest()
    assert target.read_bytes() == raw
    preserve_submission(source, target)
    source.write_bytes(b"different")
    with pytest.raises(ValueError, match="拒绝覆盖"):
        preserve_submission(source, target)
    assert target.read_bytes() == raw
