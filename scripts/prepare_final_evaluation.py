"""Freeze independent reviewer inputs and real model outputs without supplying judge scores."""

import argparse
import hashlib
import json
import subprocess
import time

from backend.core.config import ROOT
from backend.modules.diagnosis.client import create_client
from backend.modules.diagnosis.config import DiagnosisSettings
from backend.modules.diagnosis.public import DiagnosisService
from backend.modules.jobs.public import JobsService
from backend.modules.resume.public import ResumeService
from backend.schemas.contracts import JD, DiagnosisInput, JDInput, Resume, TextInput

OUTPUT = ROOT / "data/evaluation/2026-09-08"
HOLDOUT = ROOT / "data/holdout/2026-09-08"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def prepare(*, live=False):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    plan_path = OUTPUT / "operator-record.json"
    if plan_path.exists():
        record = load(plan_path)
    else:
        parser, matcher = ResumeService(), JobsService()
        resumes, jobs = [], []
        for i in range(1, 4):
            raw = load(HOLDOUT / f"resumes/student-{i:02d}.json")["raw_text"]
            resumes.append(Resume(id=f"R{i}", **parser.parse(TextInput(raw_text=raw)).model_dump()))
        for i in range(1, 6):
            raw = load(HOLDOUT / f"jd/holdout-jd-{i:02d}.json")
            parsed = matcher.parse(
                JDInput(**{key: raw[key] for key in ("title", "company", "jd_text")})
            )
            jobs.append(JD(id=f"J{i}", **parsed.model_dump()))
        record = {
            "code_sha": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
            ).strip(),
            "evaluation_kind": "independent_ai_blind_review",
            "review_status": "pending",
            "model_identity_hidden_from_reviewer": True,
            "resumes": [value.model_dump() for value in resumes],
            "jobs": [value.model_dump() for value in jobs],
            "predictions": [
                matcher.match(resume, job).model_dump() for resume in resumes for job in jobs
            ],
            "diagnosis_cases": [],
        }
        for index, job_index in enumerate((0, 3, 2)):
            resume, job = resumes[index], jobs[job_index]
            # Select the entire first parsed experience, never truncate a paragraph to fit.
            experience = resume.experience[0] if resume.experience else "未提供可确认的经历。"
            record["diagnosis_cases"].append(
                {
                    "id": f"D{index + 1}",
                    "resume_id": resume.id,
                    "jd_id": job.id,
                    "experience": experience,
                    "status": "pending",
                }
            )
        frozen = json.dumps(
            {key: record[key] for key in ("resumes", "jobs", "diagnosis_cases")},
            ensure_ascii=False,
            sort_keys=True,
        )
        record["input_sha256"] = hashlib.sha256(frozen.encode()).hexdigest()
        save(plan_path, record)
    if live:
        settings = DiagnosisSettings()
        if not settings.api_key.get_secret_value().strip():
            raise ValueError("缺少模型配置；请在本地 .env 配置，不要提交密钥")
        for case in record["diagnosis_cases"]:
            if case["status"] != "pending":
                continue
            attempts = []
            service = DiagnosisService(
                create_client(settings, on_attempt=attempts.append), settings=settings
            )
            job = next(row for row in record["jobs"] if row["id"] == case["jd_id"])
            started = time.monotonic()
            try:
                detail = service.diagnose_detail(
                    DiagnosisInput(resume_text=case["experience"], jd_text=job["jd_text"])
                )
                case.update(status="completed", result=detail.model_dump(), is_mock=service.is_mock)
            except Exception as error:
                case.update(status="failed", error_type=type(error).__name__)
            case.update(
                latency_seconds=round(time.monotonic() - started, 3),
                attempts=attempts,
                model=settings.model,
                api_style=settings.api_style,
            )
            save(plan_path, record)
            print(json.dumps({key: case[key] for key in ("id", "status", "latency_seconds")}))
    return record


def render(record):
    tasks = []
    for resume in record["resumes"]:
        tasks.append(
            {
                "id": "P" + resume["id"][1:],
                "kind": "解析",
                "resume": resume["id"],
                "job": None,
                "prompt": "对照完整原文，检查解析草稿是否漏掉明确技能/经历、是否多填事实。准确性 1–5 分；在说明中列出漏项或误项。",
                "candidate": {key: resume[key] for key in ("education", "skills", "experience")},
            }
        )
    index = 0
    for resume in record["resumes"]:
        for job in record["jobs"]:
            index += 1
            tasks.append(
                {
                    "id": f"M{index:02d}",
                    "kind": "匹配",
                    "resume": resume["id"],
                    "job": job["id"],
                    "prompt": "不看算法分数，评估投递适配度 1–5 分：1 明显不符，2 多数要求缺证据，3 部分符合，4 大体符合，5 关键要求有充分证据。请分别记录已证实技能、缺失/未证实技能和学历/届别/经验等硬条件。",
                    "candidate": None,
                }
            )
    for case in record["diagnosis_cases"]:
        candidates = [
            case["experience"],
            "\n\n".join(
                row["optimized"] for row in case.get("result", {}).get("star_rewrites", [])
            ),
        ]
        if case["status"] != "completed":
            candidates[1] = (
                "本次模型请求失败，没有可评分的改写；请在问题栏记为调用失败，不能把缺失输出视为正确。"
            )
        swap = (
            int(hashlib.sha256((record["input_sha256"] + case["id"]).encode()).hexdigest()[:2], 16)
            % 2
        )
        if swap:
            candidates.reverse()
        case["candidate_mapping"] = {
            "A": "model" if swap else "original",
            "B": "original" if swap else "model",
        }
        tasks.append(
            {
                "id": case["id"],
                "kind": "改写",
                "resume": case["resume_id"],
                "job": case["jd_id"],
                "prompt": "只根据选定经历原文判断 A/B 的清晰度、针对性、事实忠实度。评分填写 A/B 各 1–5；列出任何新增技能、职责、数字或成果。候选来源已隐藏，但文风可能暴露来源，不能声称完全双盲。",
                "candidate": {
                    "选定经历": case["experience"],
                    "A": candidates[0],
                    "B": candidates[1],
                    "状态": case["status"],
                    "岗位建议": case.get("result", {}).get("jd_targeted_suggestions", []),
                },
            }
        )
    save(OUTPUT / "operator-record.json", record)
    # Deliberately omit algorithm scores, model identity and A/B mapping from the reviewer artifact.
    payload = {
        "input_sha256": record["input_sha256"],
        "resumes": record["resumes"],
        "jobs": record["jobs"],
        "tasks": tasks,
    }
    source = (ROOT / "scripts/evaluation-reviewer.html").read_text(encoding="utf-8")
    html = source.replace(
        "__EVALUATION_DATA__", json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    )
    (OUTPUT / "reviewer.html").write_text(html, encoding="utf-8")
    print(f"Prepared {len(tasks)} unscored tasks; review_status=pending")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live",
        action="store_true",
        help="对三个固定经历进行真实模型调用；失败样本保留，不自动挑选成功结果",
    )
    render(prepare(live=parser.parse_args().live))
