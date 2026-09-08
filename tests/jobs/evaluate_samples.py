"""Reproducible sample observations, not a trained model or market inference."""

import json
from pathlib import Path

from backend.modules.jobs.keywords import canonicalize
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JD, JDInput, Resume


def evaluate():
    root = Path(__file__).resolve().parents[2]

    def load(path):
        return json.loads(path.read_text(encoding="utf-8"))

    jobs = {j["id"]: j for p in (root / "data/jd").glob("*.json") for j in load(p)}
    resumes = {r["id"]: r for p in (root / "data/resumes").glob("*.json") for r in [load(p)]}
    service = JobsService()
    parsed = {}
    lines = [
        "# 关键词样本验证",
        "",
        "固定词表规则，未训练/调用 embedding 或 AI。",
        "领域词表参考本批 JD 人工技能标注；本报告是样本内观察，不是独立留出评测。运行时不读取样本 ID、人工匹配分数或 baseline。",
        "30 个 JD（9 real_web、21 synthetic）、10 份 synthetic 简历；真实学生简历为 0。",
        "人工标注用于对照，不是系统输出。词表覆盖及标注口径差异影响结果，不作为市场结论。",
        "",
        "## JD 提取与人工关键词并集对照",
        "",
        "| JD | 系统关键词数 | 人工关键词数 | 共同关键词数 |",
        "| --- | --- | --- | --- |",
    ]
    for identifier, row in sorted(jobs.items()):
        value = service.parse(
            JDInput(title=row["title"], company=row["company"], jd_text=row["raw_text"])
        )
        parsed[identifier] = JD(id=identifier, **value.model_dump())
        expected = canonicalize(row["skills_manual"] + row["tools_manual"])
        actual = canonicalize(value.skills)
        lines.append(
            f"| {identifier} | {len(actual)} | {len(expected)} | {len(actual.keys() & expected.keys())} |"
        )
    lines += [
        "",
        "## 两轮 40 组匹配",
        "",
        "使用简历已提供的 skills（不从课程/原文推断掌握技能）。人工档位结合语义与经历，",
        "本算法只计字面关键词覆盖，两者不要求一致。MySQL 不自动算 SQL；不把相关概念当等价。",
        "",
        "| pair | 关键词分 | 已匹配数 | 缺失数 | 人工档位 |",
        "| --- | --- | --- | --- | --- |",
    ]
    count = 0
    for path in sorted((root / "data/baselines").glob("*.json")):
        for item in load(path)["pairs"]:
            row = resumes[item["resume_id"]]
            resume = Resume(id=row["id"], raw_text=row["raw_text_anonymized"], skills=row["skills"])
            result = service.match(resume, parsed[item["jd_id"]])
            lines.append(
                f"| {item['pair_id']} | {result.score:g} | {len(result.matched_skills)} | "
                f"{len(result.missing_skills)} | {item.get('match_level_manual', '未标注')} |"
            )
            count += 1
    assert count == 40
    lines += [
        "",
        "局限：固定词表不覆盖全部泛化能力、同义语义或逻辑选择要求；",
        "“至少一种”仍按显式关键词等权计数；该分数不是岗位适任性或录用概率。",
        "这些差异应由样本审查指导下一阶段，不从人工 baseline 直接生成固定输出。",
        "",
    ]
    target = root / "docs/integration_requests/D-keyword-evaluation.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    print(f"Evaluated {len(jobs)} JDs and {count} pairs -> {target.name}")


if __name__ == "__main__":
    evaluate()
