"""Frozen v1-vs-v2 comparison. Run explicitly with the real local model."""

import json
from pathlib import Path

from backend.modules.jobs.embedding import LocalMiniLM, chunks, compare
from backend.modules.jobs.evidence_filter import PREPROCESSING_VERSION
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JD, Resume


def main():
    root = Path(__file__).resolve().parents[2]
    provider = LocalMiniLM()
    service = JobsService(embedding=provider, semantic_weight=0.2)
    lines = [
        "# D 否定/意向过滤：真实模型前后对照",
        "",
        "模型、revision、384 维 cosine、0.2 权重保持不变。旧算法按原 chunks + compare 重现，不读取旧分数充当新结果。",
        f"新预处理 `{PREPROCESSING_VERSION}`；规则在新样本编写前冻结，Git blob e0372303e0ffe8f242cc31947a91ebe891b47c15。",
        "新集 16 组三元对照 / 32 配对，覆盖 8 类要求。由同一开发者在规则冻结后新编，未用于设计/调参，但不是独立人员盲测。",
        "已有 8 组只作开发回归，不能再算独立评测。新旧都使用相同结构化关键词，故可隔离语义过滤效果。",
        "rank 要求正例严格胜过反例；zero 要求双方都为 0（JD 没有有效要求），不把相似度涨分当改善。",
        "",
    ]
    totals = {}
    for name, filename in [
        ("开发回归", "semantic_samples.json"),
        ("新独立集", "semantic_holdout_v2.json"),
    ]:
        samples = json.loads(Path(__file__).with_name(filename).read_text(encoding="utf-8"))
        counts = [0, 0, 0]
        lines += [
            f"## {name}",
            "",
            "| case | 判据 | keyword 正/反 | 旧增强 正/反 | 新增强 正/反 | 正确：keyword/旧/新 |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        failures = []
        for row in samples:
            values = [[], [], []]
            for side in ("positive", "negative"):
                resume = Resume(id=side, raw_text=row[side], experience=[row[side]])
                jd = JD(id=row["id"], title="验证岗位", jd_text=row["jd"], skills=row["skills"])
                keyword = service.keyword_match(resume, jd).score
                old_semantic, _ = compare(
                    provider, chunks([jd.jd_text]), chunks(resume.experience + resume.skills)
                )
                current = service.match_detail(resume, jd)
                if current.status not in ("semantic", "empty"):
                    raise RuntimeError("Real model unavailable; do not write success report")
                for target, value in zip(
                    values,
                    [keyword, round(0.8 * keyword + 0.2 * old_semantic, 2), current.final_score],
                    strict=True,
                ):
                    target.append(value)
            expected = row.get("expect", "rank")
            correct = [p > n if expected == "rank" else p == n == 0 for p, n in values]
            counts = [a + b for a, b in zip(counts, correct, strict=True)]
            if not correct[2]:
                failures.append(row["id"])
            columns = [f"{p:g}/{n:g}" for p, n in values]
            lines.append(
                f"| {row['id']} | {expected} | {' | '.join(columns)} | {'/'.join('是' if c else '否' for c in correct)} |"
            )
        totals[name] = {"correct": counts, "total": len(samples), "failures": failures}
        lines += [
            "",
            f"正确 keyword/旧/新：{counts} / {len(samples)}；新规则失败：{', '.join(failures) or '无'}。",
            "",
        ]
    lines += [
        "局限：开发回归中新引入 SQL 执行计划被“计划”误伤；独立集中整句过滤误伤 not only 和否定/事实混合句。",
        "不根据本评测改规则，保留失败供下一轮独立验收。",
        "结构化 skills 仍由用户/上游确认，若其与否定原文矛盾，不擅自改写，需重新解析/人工确认。",
        "默认 off；未验证真实 pgvector。以上为固定样本判断正确率，不是生产准确率或统计显著性证明。",
        "",
    ]
    (root / "docs/integration_requests/D-filter-evaluation.md").write_text(
        "\n".join(lines), encoding="utf-8"
    )
    print(json.dumps(totals, ensure_ascii=False))


if __name__ == "__main__":
    main()
