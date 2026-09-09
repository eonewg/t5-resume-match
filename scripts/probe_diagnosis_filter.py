"""One explicit Ling request per invocation; read-only inputs, redacted evidence."""

import argparse
import hashlib
import json
import time
from pathlib import Path

from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.database import build_engine
from backend.models.entities import JDRow, ResumeRow
from backend.modules.diagnosis.client import create_client
from backend.modules.diagnosis.config import DiagnosisSettings
from backend.modules.diagnosis.errors import DiagnosisError
from backend.modules.diagnosis.prompts import PROMPT_VERSION, SYSTEM_PROMPT
from backend.modules.diagnosis.public import DiagnosisService
from backend.schemas.contracts import DiagnosisInput

SIMPLE_RESUME = "技能：Python、SQL\n经历：在课程项目中使用 Python 整理数据，使用 SQL 查询数据。"
SIMPLE_JD = "初级数据分析岗位，使用 Python 整理数据和 SQL 查询数据。"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume-id", required=True)
    parser.add_argument("--jd-id", required=True)
    parser.add_argument("--combo", choices=["original", "resume", "jd", "simple"], required=True)
    parser.add_argument("--jd-lines", help="Optional zero-based start:end for localization only")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    settings = DiagnosisSettings(max_attempts=1, output_retries=0, cache_size=0)
    assert settings.model.casefold() == "ling-3.0-flash"
    assert settings.llm_vendor == "custom" and settings.api_style == "openai_chat"
    engine = build_engine(Settings().database_url)
    with Session(engine) as db:
        resume = dict(db.get(ResumeRow, args.resume_id).payload)
        jd = dict(db.get(JDRow, args.jd_id).payload)
    engine.dispose()
    sections = []
    for key, label in [("name", "姓名"), ("education", "教育")]:
        if resume[key]:
            sections.append(label + "：" + resume[key])
    if resume["skills"]:
        sections.append("技能：" + "、".join(resume["skills"]))
    if resume["experience"]:
        sections.append("经历：\n" + "\n\n".join(resume["experience"]))
    original_resume = "\n".join(sections) or "用户确认的简历未提供姓名、教育、技能或经历。"
    resume_text = original_resume if args.combo in ("original", "resume") else SIMPLE_RESUME
    jd_text = jd["jd_text"] if args.combo in ("original", "jd") else SIMPLE_JD
    if args.jd_lines:
        assert args.combo in ("original", "jd")
        start, end = map(int, args.jd_lines.split(":"))
        jd_text = "\n".join(jd_text.splitlines()[start:end])
    data = DiagnosisInput(resume_text=resume_text, jd_text=jd_text)

    def digest(text):
        return hashlib.sha256(text.encode()).hexdigest()

    report = {
        "model": settings.model,
        "prompt_version": PROMPT_VERSION,
        "prompt_sha256": digest(SYSTEM_PROMPT),
        "combo": args.combo,
        "jd_lines": args.jd_lines,
        "input_sha256": [digest(resume_text), digest(jd_text)],
        "input_lengths": [len(resume_text), len(jd_text)],
        "status": "reserved",
        "schema_passed": None,
        "facts_passed": None,
    }
    # Exclusive creation prevents accidentally replaying a completed experiment.
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream)
    events, attempts = [], []
    service = DiagnosisService(
        create_client(settings, on_attempt=events.append),
        settings=settings,
        on_attempt=attempts.append,
    )
    started = time.monotonic()
    try:
        result = service.diagnose_detail(data)
        report.update(
            status="validated",
            schema_passed=True,
            facts_passed=True,
            star_count=len(result.star_rewrites),
        )
    except DiagnosisError as error:
        report.update(status="failed", **error.metadata())
    finally:
        report.update(
            elapsed_seconds=round(time.monotonic() - started, 3),
            client_events=events,
            attempts=attempts,
        )
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
