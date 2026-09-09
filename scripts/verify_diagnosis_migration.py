"""Explicit one-call SiliconFlow checks; never collected by pytest or auto-retried."""

import argparse
import hashlib
import json
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.database import build_engine
from backend.models.entities import JDRow, ResumeRow
from backend.modules.diagnosis.client import create_client
from backend.modules.diagnosis.config import DiagnosisSettings
from backend.modules.diagnosis.errors import DiagnosisError
from backend.modules.diagnosis.prompts import PROMPT_VERSION, SYSTEM_PROMPT
from backend.modules.diagnosis.public import DiagnosisService
from backend.modules.diagnosis.schema import FILTER_WARNING
from backend.schemas.contracts import DiagnosisInput


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def confirmed_resume(payload):
    sections = []
    for name, label in [("name", "姓名"), ("education", "教育")]:
        if payload[name]:
            sections.append(label + "：" + payload[name])
    if payload["skills"]:
        sections.append("技能：" + "、".join(payload["skills"]))
    if payload["experience"]:
        sections.append("经历：\n" + "\n\n".join(payload["experience"]))
    return "\n".join(sections) or "用户确认的简历未提供姓名、教育、技能或经历。"


def inputs(case, baseline):
    if case == "simple":
        return DiagnosisInput(
            resume_text="技能：Python、SQL\n经历：在课程项目中使用 Python 整理数据，使用 SQL 查询数据。",
            jd_text="初级数据分析岗位，使用 Python 整理数据和 SQL 查询数据。",
        )
    if case == "normal":
        return DiagnosisInput(
            resume_text="技能：Java、MySQL\n课程项目：开发图书借阅系统，负责使用 Java 实现借阅接口，使用 MySQL 保存图书和借阅记录，编写接口测试。",
            jd_text="Java 后端开发实习生：参与业务接口开发和测试，使用 MySQL 维护数据；要求掌握 Java 和 SQL，能够清晰说明课程项目。",
        )
    expected = json.loads(baseline.read_text(encoding="utf-8"))["input_sha256"]
    engine = build_engine(Settings().database_url)
    try:
        with Session(engine) as db:
            resumes = [confirmed_resume(row.payload) for row in db.scalars(select(ResumeRow))]
            jobs = [row.payload["jd_text"] for row in db.scalars(select(JDRow))]
        resume = next(value for value in resumes if digest(value) == expected[0])
        jd = next(value for value in jobs if digest(value) == expected[1])
        return DiagnosisInput(resume_text=resume, jd_text=jd)
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["smoke", "simple", "filtered", "normal"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    settings = DiagnosisSettings(
        max_attempts=1,
        output_retries=0,
        cache_size=0,
        timeout_seconds=90,
        read_timeout_seconds=85,
        total_timeout_seconds=95,
    )
    assert settings.llm_vendor == "custom" and settings.api_style == "openai_chat"
    assert settings.endpoint == "https://api.siliconflow.cn/v1/chat/completions"
    assert settings.json_mode is True
    report = {
        "provider": "SiliconFlow",
        "vendor": settings.llm_vendor,
        "model": settings.model,
        "case": args.case,
        "prompt_version": PROMPT_VERSION,
        "prompt_sha256": digest(SYSTEM_PROMPT),
        "status": "reserved",
        "schema_passed": None,
        "facts_number_guard_passed": None,
        "star_original_guard_passed": None,
    }
    data = None if args.case == "smoke" else inputs(args.case, args.baseline)
    if data:
        report["input_sha256"] = [digest(data.resume_text), digest(data.jd_text)]
        report["input_lengths"] = [len(data.resume_text), len(data.jd_text)]
        report["source"] = "saved_real_input" if args.case == "filtered" else "synthetic_acceptance"
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream)
    events, attempts = [], []
    client = create_client(settings, on_attempt=events.append)
    started = time.monotonic()
    try:
        if data is None:
            raw = client.complete(
                [
                    {"role": "system", "content": "Return only one valid JSON object."},
                    {"role": "user", "content": 'Return {"ok":true}.'},
                ]
            )
            report.update(
                status="validated",
                nonempty_content=bool(raw.strip()),
                valid_json=isinstance(json.loads(raw), dict),
            )
        else:
            service = DiagnosisService(client, settings=settings, on_attempt=attempts.append)
            result = service.diagnose_detail(data)
            report.update(
                status="validated",
                schema_passed=True,
                facts_number_guard_passed=True,
                star_original_guard_passed=True,
                star_count=len(result.star_rewrites),
                summary_present=bool(result.summary),
                targeted_count=len(result.jd_targeted_suggestions),
                keyword_count=len(result.keywords_to_strengthen),
                risk_count=len(result.risks),
                filter_notice=FILTER_WARNING in result.risks,
            )
            # Review at the source without retaining sensitive input/output bodies on disk.
            report["fact_review"] = (
                "Automatic original/Arabic-number guards only; not proof of semantic fidelity."
            )
    except DiagnosisError as error:
        report.update(status="failed", **error.metadata())
        if error.phase == "fact_guard":
            # parse_detail validates JSON/schema before reaching either STAR guard.
            report["schema_passed"] = True
            reasons = {
                "STAR 原文必须来自输入简历": "original_not_in_resume",
                "STAR 改写包含原文未提供的数字": "unsupported_number",
            }
            report["guard_reason"] = reasons.get(str(error), "unspecified_fact_guard")
    except (ValueError, TypeError):
        report.update(status="failed", phase="smoke_json")
    finally:
        report.update(
            elapsed_seconds=round(time.monotonic() - started, 3),
            client_events=events,
            attempts=attempts,
        )
        args.output.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=False), flush=True)
    return 0 if report["status"] == "validated" else 1


if __name__ == "__main__":
    raise SystemExit(main())
