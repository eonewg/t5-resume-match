"""One supplemental batch; retain all outcomes and never overwrite a completed case."""

import hashlib
import json
import subprocess
import time
from pathlib import Path

from backend.modules.diagnosis.client import create_client
from backend.modules.diagnosis.config import DiagnosisSettings
from backend.modules.diagnosis.prompts import PROMPT_VERSION
from backend.modules.diagnosis.public import DiagnosisService
from backend.schemas.contracts import DiagnosisInput

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
HOLDOUT = ROOT / "data/holdout/2026-09-08"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(value):
    return hashlib.sha256(value).hexdigest()


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    settings = DiagnosisSettings()
    # Freeze non-secret settings; the endpoint is hashed, never published.
    configuration = settings.model_dump(
        exclude={"api_key", "legacy_api_key", "base_url", "endpoint_path"}
    )
    configuration["endpoint_sha256"] = digest(settings.endpoint.encode())
    configuration["prompt_version"] = PROMPT_VERSION
    configuration["prompt_sha256"] = digest(
        (ROOT / "backend/modules/diagnosis/prompts.py").read_bytes()
    )
    baseline = {
        path.relative_to(ROOT).as_posix(): digest(path.read_bytes())
        for path in sorted((ROOT / "data/evaluation/2026-09-08").rglob("*"))
        if path.is_file()
    }
    record_path = OUT / "operator-record.json"
    if record_path.exists():
        record = read(record_path)
        assert record["configuration"] == configuration, "Frozen configuration changed"
        assert record["original_evaluation_hashes"] == baseline, "Original evaluation changed"
    else:
        cases = []
        for case_id, resume_id, start, end, jd_id, rationale in [
            (
                "S1",
                "student-01",
                "SFLE Knowledgebase\n",
                "\n\nSound Waves",
                "holdout-jd-04",
                "完整网页原型和 MySQL 数据库项目；JD 含 web applications / relational databases，"
                "可考查无量化成果时是否只提示补充，不虚构 CI/Linux 经历。",
            ),
            (
                "S2",
                "student-02",
                "Tecorigin Deep Learning Operator",
                "\n\nSunway PCG",
                "holdout-jd-01",
                "完整算子性能项目，含工作、瓶颈和原有指标；JD 含 performance / high quality code，"
                "可考查数字忠实度，不把性能项目转换成不存在的 Linux/开源贡献。",
            ),
        ]:
            resume_path = HOLDOUT / f"resumes/{resume_id}.json"
            jd_path = HOLDOUT / f"jd/{jd_id}.json"
            resume, jd = read(resume_path), read(jd_path)
            raw = resume["raw_text"]
            experience = raw[raw.index(start) : raw.index(end, raw.index(start))]
            assert experience in raw and len(experience) > 300
            cases.append(
                {
                    "id": case_id,
                    "resume_source": resume_path.relative_to(ROOT).as_posix(),
                    "resume_source_sha256": digest(resume_path.read_bytes()),
                    "jd_source": jd_path.relative_to(ROOT).as_posix(),
                    "jd_source_sha256": digest(jd_path.read_bytes()),
                    "resume_text": experience,
                    "jd_text": jd["jd_text"],
                    "jd_title": jd["title"],
                    "selection_rationale": rationale,
                    "input_sha256": digest(
                        json.dumps([experience, jd["jd_text"]], ensure_ascii=False).encode()
                    ),
                    "status": "pending",
                }
            )
        record = {
            "evaluation_kind": "supplemental_star_validation",
            "label": "补充 STAR 验证；独立于原固定评估",
            "code_sha": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
            ).strip(),
            "configuration": configuration,
            "original_evaluation_hashes": baseline,
            "input_policy": "两个案例在调用前固定；完整项目段落逐字摘取，未经过解析器，未添加技能或成果。"
            "来源是已归档公开学生履历，不是新受试者；不推断整份简历或总体质量。",
            "cases": cases,
        }
        write(record_path, record)
    for case in record["cases"]:
        if case["status"] != "pending":
            continue
        attempts = []
        service = DiagnosisService(
            create_client(settings, on_attempt=attempts.append), settings=settings
        )
        assert not service.is_mock
        case["status"] = "started"
        write(record_path, record)  # An interrupted attempt must not silently rerun.
        started = time.monotonic()
        try:
            result = service.diagnose_detail(
                DiagnosisInput(resume_text=case["resume_text"], jd_text=case["jd_text"])
            )
            case.update(status="completed", result=result.model_dump(), is_mock=False)
        except Exception as error:
            case.update(status="failed", error_type=type(error).__name__)
        case.update(latency_seconds=round(time.monotonic() - started, 3), attempts=attempts)
        write(record_path, record)
        print(
            json.dumps({key: case[key] for key in ("id", "status", "latency_seconds")}), flush=True
        )
    assert baseline == {
        path.relative_to(ROOT).as_posix(): digest(path.read_bytes())
        for path in sorted((ROOT / "data/evaluation/2026-09-08").rglob("*"))
        if path.is_file()
    }
    write(
        OUT / "reviewer-materials.json",
        {
            "evaluation_kind": "supplemental_star_validation",
            "review_type": "independent_agent_review_not_human",
            "rubric": ["原文忠实度", "新增事实或数字（逐条证据）", "JD 针对性", "改写可用性"],
            "cases": [
                {
                    key: case[key]
                    for key in ("id", "input_sha256", "resume_text", "jd_text", "status")
                }
                | {"result": case.get("result"), "error_type": case.get("error_type")}
                for case in record["cases"]
            ],
        },
    )


if __name__ == "__main__":
    main()
