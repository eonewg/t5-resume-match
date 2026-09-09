"""Explicit real API acceptance. Never collected by pytest; uses local secrets only."""

import argparse
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.core.providers import Provider
from backend.main import create_app
from backend.modules.diagnosis.client import create_client
from backend.modules.diagnosis.config import DiagnosisSettings
from backend.modules.diagnosis.public import DiagnosisService


def run(*, settings=None, opener=None):
    settings = settings or DiagnosisSettings()
    attempts = []
    adapter = create_client(settings, opener=opener, on_attempt=attempts.append)
    service = DiagnosisService(adapter, settings=settings)
    report = {
        "vendor": settings.llm_vendor,
        "model": settings.model,
        "api_style": settings.api_style,
        "status": "not_started",
        "latency_seconds": None,
        "attempts": attempts,
        "retry_count": 0,
        "fact_guard": False,
        "structured_output": False,
        "is_mock": service.is_mock,
    }
    if not settings.api_key.get_secret_value().strip():
        report["status"] = "blocked_missing_key"
        return report
    # Isolated SQLite API application: no edits to A's runtime or shared database.
    app = create_app(
        Settings(
            _env_file=None,
            database_url="sqlite://",
            resume_provider="backend.modules.resume.public:ResumeService",
            jobs_provider="backend.modules.jobs.public:JobsService",
        )
    )
    with TestClient(app) as client:
        app.state.providers["diagnosis"] = Provider(service, False)
        original = "技能：Python、SQL\n项目经历：使用 Python 清洗课程数据，处理 120 条记录，使用 SQL 汇总结果。"
        draft = client.post("/api/v1/resumes/preview", json={"raw_text": original})
        if draft.status_code != 200:
            raise RuntimeError("Resume preview acceptance failed")
        resume = client.post("/api/v1/resumes", json=draft.json())
        job = client.post(
            "/api/v1/jobs",
            json={
                "title": "数据分析实习生",
                "jd_text": "要求 Python、SQL，能够清洗数据并撰写分析说明。",
            },
        )
        if resume.status_code != 201 or job.status_code != 201:
            raise RuntimeError("Resume/JD acceptance setup failed")
        start = time.monotonic()
        response = client.post(
            "/api/v1/workflow", json={"resume_id": resume.json()["id"], "jd_id": job.json()["id"]}
        )
        report["latency_seconds"] = round(time.monotonic() - start, 3)
        report["http_status"] = response.status_code
        report["retry_count"] = max(0, len(attempts) - 1)
        if response.status_code not in (200, 201):
            report["status"] = "failed"
            return report
        result = response.json()
        diagnosis = result["diagnosis"]
        report.update(
            status="passed",
            fact_guard=True,
            structured_output=True,
            is_mock=diagnosis["is_mock"],
            suggestions=diagnosis["suggestions"],
            summary=diagnosis["summary"],
            match_score=result["match"]["score"],
        )
        # Valid output passed existing parse_detail guards. Human factual review is still needed.
        report["star_present"] = any(
            value.startswith("【STAR】") for value in diagnosis["suggestions"]
        )
        report["jd_suggestions_present"] = any(
            value.startswith("【岗位建议】") for value in diagnosis["suggestions"]
        )
        if not report["star_present"] or not report["jd_suggestions_present"] or report["is_mock"]:
            report["status"] = "failed_acceptance"
        report["original_resume"] = original
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".verification/diagnosis-live.json")
    args = parser.parse_args()
    result = run()
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    # Do not print upstream body, reasoning, headers, URL or configuration object.
    print(
        json.dumps(
            {
                k: result[k]
                for k in ("status", "model", "api_style", "latency_seconds", "retry_count")
            },
            ensure_ascii=False,
        )
    )
    raise SystemExit(0 if result["status"] == "passed" else 1)


if __name__ == "__main__":
    main()
