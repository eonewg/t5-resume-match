"""Validate a real reviewer submission and summarize it; never manufacture missing ratings."""

import argparse
import hashlib
import json
import statistics
from pathlib import Path

from scripts.prepare_final_evaluation import OUTPUT


def ranks(values):
    return [
        sum(i + 1 for i, item in enumerate(sorted(values)) if item == value) / values.count(value)
        for value in values
    ]


def summarize(submission, record):
    if submission.get("input_sha256") != record["input_sha256"]:
        raise ValueError("输入版本不一致，拒绝混用评分")
    if not str(submission.get("reviewer", "")).strip():
        raise ValueError("缺少评审模型或任务代号")
    ratings = submission.get("ratings", {})
    identifiers = (
        [f"P{i}" for i in range(1, 4)]
        + [f"M{i:02d}" for i in range(1, 16)]
        + [f"D{i}" for i in range(1, 4)]
    )
    for key in identifiers:
        row = ratings.get(key, {})
        if not row.get("notes", "").strip():
            raise ValueError(f"{key} 缺少理由")
        fields = (("A", "score"), ("B", "scoreB")) if key.startswith("D") else ((None, "score"),)
        for candidate, field in fields:
            absent = False
            if candidate:
                case = next(c for c in record["diagnosis_cases"] if c["id"] == key)
                absent = case["candidate_mapping"][candidate] == "model" and (
                    case["status"] != "completed" or not case.get("result", {}).get("star_rewrites")
                )
            value = str(row.get(field))
            if value not in {"1", "2", "3", "4", "5"} and not (absent and value == ""):
                raise ValueError(f"{key} 缺少有效 {field}；只有缺失模型输出可以留空，不以零填补")
    human = [int(ratings[f"M{i:02d}"]["score"]) for i in range(1, 16)]
    model = [row["score"] for row in record["predictions"]]
    try:
        correlation = statistics.correlation(ranks(human), ranks(model))
    except statistics.StatisticsError:
        correlation = None
    deltas = []
    for case in record["diagnosis_cases"]:
        if case["status"] != "completed" or not case.get("result", {}).get("star_rewrites"):
            continue
        scores = {
            case["candidate_mapping"][candidate]: int(ratings[case["id"]][field])
            for candidate, field in (("A", "score"), ("B", "scoreB"))
        }
        deltas.append(scores["model"] - scores["original"])
    return {
        "status": "ai_rated_awaiting_final_acceptance",
        "evaluation_kind": "independent_ai_blind_review",
        "reviewer": submission["reviewer"],
        "input_sha256": record["input_sha256"],
        "parse_count": 3,
        "parse_mean": statistics.mean(int(ratings[f"P{i}"]["score"]) for i in range(1, 4)),
        "match_count": 15,
        "keyword_vs_judge_spearman": correlation,
        "diagnosis_attempted_cases": 3,
        "diagnosis_completed_cases": sum(
            c["status"] == "completed" for c in record["diagnosis_cases"]
        ),
        "diagnosis_failed_cases": sum(c["status"] == "failed" for c in record["diagnosis_cases"]),
        "rewrite_available_cases": len(deltas),
        "rewrite_empty_completed_cases": sum(
            c["status"] == "completed" and not c.get("result", {}).get("star_rewrites")
            for c in record["diagnosis_cases"]
        ),
        "rewrite_mean_delta_among_available": statistics.mean(deltas) if deltas else None,
        "rewrite_improved_count": sum(delta > 0 for delta in deltas),
        "limitations": "独立 AI 盲评 / LLM-as-a-Judge，小样本且可能有模型偏好；主观岗位适配度与关键词覆盖不是同一概念。相关系数不等于准确率；失败样本单列，不从成功率分母删除。事实问题需逐条复核，不代表人工金标准，不自动宣布最终 PASS。",
    }


def preserve_submission(source, destination):
    """Archive exact bytes before validation, refusing to overwrite a different submission."""
    raw = source.read_bytes()
    if destination.exists() and destination.read_bytes() != raw:
        raise ValueError("已有不同评分原件，拒绝覆盖；请另建评估版本")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        destination.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ratings", type=Path)
    parser.add_argument("--output", type=Path, default=OUTPUT / "ai-summary.json")
    args = parser.parse_args()
    raw_sha = preserve_submission(args.ratings, OUTPUT / "reviewer-ai.json")
    result = summarize(
        json.loads(args.ratings.read_text(encoding="utf-8")),
        json.loads((OUTPUT / "operator-record.json").read_text(encoding="utf-8")),
    )
    if args.output.resolve() in {
        args.ratings.resolve(),
        (OUTPUT / "reviewer-ai.json").resolve(),
        (OUTPUT / "operator-record.json").resolve(),
    }:
        raise ValueError("汇总输出不能覆盖评审原件或固定输入")
    result["submission_sha256"] = raw_sha
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                key: result[key]
                for key in ("status", "parse_count", "match_count", "diagnosis_completed_cases")
            }
        )
    )
