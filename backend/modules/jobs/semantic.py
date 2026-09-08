"""D-internal metadata and blend policy. Public MatchResult stays unchanged."""

import math
from dataclasses import dataclass

from backend.schemas.contracts import JD, MatchResult, Resume

from .embedding import (
    MAX_DOCUMENT_FRAGMENTS,
    EmbeddingProvider,
    InputBudgetError,
    SemanticEvidence,
    chunks,
    compare,
)
from .evidence_filter import filter_clauses


@dataclass(frozen=True)
class MatchDetails:
    result: MatchResult
    keyword_score: float
    semantic_score: float | None
    final_score: float
    status: str
    model: str | None = None
    evidence: tuple[SemanticEvidence, ...] = ()


def enhance(
    baseline: MatchResult,
    resume: Resume,
    jd: JD,
    provider: EmbeddingProvider | None,
    weight: float = 0.2,
    *,
    comparator=None,
) -> MatchDetails:
    if not math.isfinite(weight) or not 0 <= weight <= 0.5:
        raise ValueError("semantic weight must be finite and between 0 and 0.5")

    def fallback(status, reason=None):
        result = baseline.model_copy(deep=True)
        if reason:
            result.gap_analysis.append(
                f"语义增强已降级：{reason}；保留关键词分 {baseline.score:g}。"
            )
        return MatchDetails(result, baseline.score, None, baseline.score, status)

    if provider is None or weight == 0:
        return fallback("disabled")
    try:
        # Only confirmed structured resume fields, never infer skills from old raw text.
        job_text = filter_clauses([jd.jd_text], jd=True)
        resume_text = filter_clauses(resume.experience + resume.skills)
        excluded_count = len(job_text.excluded) + len(resume_text.excluded)
        requirements = chunks(list(job_text.kept), limit=MAX_DOCUMENT_FRAGMENTS)
        evidence = chunks(list(resume_text.kept), limit=MAX_DOCUMENT_FRAGMENTS)
        if not requirements or not evidence:
            return fallback(
                "empty", f"缺少有效岗位或已确认经历；过滤否定/意向/无关片段 {excluded_count} 项"
            )
        semantic, pairs = (comparator or compare)(provider, requirements, evidence)
    except Exception as error:
        if comparator is not None:
            # Let the public context roll back its savepoint before fallback.
            raise
        if isinstance(error, InputBudgetError):
            return fallback(
                "unavailable",
                "输入超出资源预算：每文档最多 512 片段、每片段最多 128 token；未截断评分",
            )
        # Provider exceptions may contain paths, credentials or resume text: do not expose them.
        return fallback("unavailable", "模型、输入预算或向量校验不可用")
    final = round((1 - weight) * baseline.score + weight * semantic, 2)

    def summary(values):
        return (
            "、".join(values[:20])
            + ("（此处仅列前 20 项，完整清单见技能列表）" if len(values) > 20 else "")
            if values
            else "无"
        )

    notes = [
        f"语义预处理排除 {excluded_count} 个否定、学习意向或福利/公司介绍片段；不将其视为已掌握技能。",
        f"关键词基线：{len(baseline.matched_skills)}/{len(baseline.matched_skills) + len(baseline.missing_skills)} 个直接命中，归一化、去重后等权计算。",
        f"直接命中关键词：{summary(baseline.matched_skills)}。",
        f"未直接命中关键词：{summary(baseline.missing_skills)}；语义相近不证明已掌握。",
        f"语义增强：关键词分 {baseline.score:g} × {1 - weight:g} + 语义分 {semantic:.2f} × {weight:g} = {final:g}。",
        "语义分为每个 JD 片段在简历已确认技能/经历中的最大非负 cosine 的均值 × 100；不是录用概率。",
    ]
    if not jd.skills:
        notes.append(
            "JD 无结构化关键词，关键词分 0 为占位；当前仅有低权重语义信号，不能视为完整评估。"
        )
    for pair in sorted(pairs, key=lambda item: item.cosine, reverse=True)[:3]:
        notes.append(
            f"语义对照（仅相似度候选）：JD「{pair.requirement}」↔ 简历「{pair.evidence}」，cosine={pair.cosine:.3f}。"
        )
    result = baseline.model_copy(update={"score": final, "gap_analysis": notes}, deep=True)
    return MatchDetails(result, baseline.score, semantic, final, "semantic", provider.model, pairs)
