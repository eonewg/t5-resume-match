"""Explicit opt-in real local model evaluation; excluded from default pytest discovery."""

import json
from pathlib import Path

from backend.modules.jobs.embedding import DIMENSION, MODEL, REVISION, LocalMiniLM
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JD, Resume


def main():
    root = Path(__file__).resolve().parents[2]
    samples = json.loads(
        Path(__file__).with_name("semantic_samples.json").read_text(encoding="utf-8")
    )
    service = JobsService(embedding=LocalMiniLM(), semantic_weight=0.2)
    lines = [
        "# D 独立语义样本评估（真实本地模型）",
        "",
        f"模型 `{MODEL}`，revision `{REVISION}`，{DIMENSION} 维，cosine。",
        "8 组新编合成对照 / 16 配对，独立于既有 JD 词表和 40 配对；不是独立人员标注或生产代表性样本。",
        "样本与 0.2 权重在首次运行模型前固定；不据本报告调参。简历仅提供经历，不暗补技能。",
        "比较正例是否排在反例之前，不把分数上升本身作为改善。反例含否定、学习意向和相关但不等价内容。",
        "",
        "| case | keyword 正/反 | semantic 正/反 | final 正/反 | keyword 排序 | blended 排序 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    wins = 0
    rows = []
    for sample in samples:
        results = []
        for side in ("positive", "negative"):
            resume = Resume(id=side, raw_text=sample[side], experience=[sample[side]])
            jd = JD(
                id=sample["id"], title="独立验证岗位", jd_text=sample["jd"], skills=sample["skills"]
            )
            detail = service.match_detail(resume, jd)
            if detail.status != "semantic":
                raise RuntimeError("Real model evaluation unavailable: no success report written")
            results.append(detail)
        positive, negative = results
        won = positive.final_score > negative.final_score
        wins += won
        lines.append(
            f"| {sample['id']} | {positive.keyword_score:g}/{negative.keyword_score:g} | "
            f"{positive.semantic_score:.2f}/{negative.semantic_score:.2f} | "
            f"{positive.final_score:g}/{negative.final_score:g} | 平分 | {'正确' if won else '错误或平分'} |"
        )
        rows.append(
            {"id": sample["id"], "positive": positive.final_score, "negative": negative.final_score}
        )
    lines += [
        "",
        f"关键词正例严格胜出 0/8（均平分）；增强正例严格胜出 {wins}/8。",
        "这是排序诊断，不是准确率校准；模型相近措辞可能掩盖否定/未实践，不能据语义相似度补写已掌握技能。",
        "默认仍关闭。待独立人工验收、更多难负例与 A 公共接口后再决定生产开启；未验证 pgvector。",
        "",
    ]
    target = root / "docs/integration_requests/D-semantic-evaluation.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"ranking_wins": wins, "total": 8, "pairs": rows}, ensure_ascii=False))


if __name__ == "__main__":
    main()
