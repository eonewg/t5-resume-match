import os
from dataclasses import dataclass

from backend.schemas.contracts import JD, JDData, JDInput, MatchResult, Resume

from .embedding import LocalMiniLM
from .evidence_filter import filter_clauses
from .keywords import TOOLS, canonicalize, extract, normalized
from .salary import parse_salary
from .semantic import enhance
from .vector_cache import cached_comparator


@dataclass(frozen=True)
class JDDetails:
    title: str
    raw_text: str
    skills: tuple[str, ...]
    tools: tuple[str, ...]


class JobsService:
    is_mock = False

    def __init__(self, embedding=None, semantic_weight=None):
        mode = os.environ.get("T5_JOBS_EMBEDDING", "off")
        self.embedding = (
            embedding if embedding is not None else LocalMiniLM() if mode == "local" else None
        )
        self.semantic_weight = (
            float(os.environ.get("T5_JOBS_SEMANTIC_WEIGHT", "0.2"))
            if semantic_weight is None
            else semantic_weight
        )

    def parse(self, data: JDInput) -> JDData:
        original = data.model_dump(warnings=False) if isinstance(data, JDInput) else data
        checked = JDInput.model_validate(original)
        # Public validation trims for validity; preserve the caller's original text values.
        accepted = filter_clauses([checked.jd_text], jd=True)
        skills = extract("\n".join(accepted.kept))
        result = JDData(
            **checked.model_dump(),
            skills=skills,
            tools=[word for word in skills if word in TOOLS],
            **parse_salary(checked.jd_text),
        )
        for field in ("jd_text", "title", "company"):
            setattr(
                result, field, original[field] if field in original else getattr(checked, field)
            )
        return result

    def parse_detail(self, data: JDInput) -> JDDetails:
        result = self.parse(data)
        return JDDetails(
            title=result.title,
            raw_text=result.jd_text,
            skills=tuple(word for word in result.skills if word not in TOOLS),
            tools=tuple(word for word in result.skills if word in TOOLS),
        )

    def match(self, resume: Resume, jd: JD) -> MatchResult:
        return self.match_detail(resume, jd).result

    def match_with_context(self, resume, jd, context) -> MatchResult:
        return self.match_detail(resume, jd, context=context).result

    def match_detail(self, resume: Resume, jd: JD, *, context=None):
        resume = Resume.model_validate(resume.model_dump(warnings=False))
        jd = JD.model_validate(jd.model_dump(warnings=False))
        if context is not None and self.embedding is not None and self.semantic_weight != 0:
            try:
                with context.vector_repository() as vectors:
                    if vectors is not None:
                        events = []
                        detail = enhance(
                            self.keyword_match(resume, jd),
                            resume,
                            jd,
                            self.embedding,
                            self.semantic_weight,
                            comparator=cached_comparator(vectors, resume, jd, events),
                        )
                        if events:
                            detail.result.gap_analysis.append(
                                "pgvector 片段缓存：" + ", ".join(events)
                            )
                        return detail
            except Exception:
                # SQL errors escape the public scope first; it owns savepoint rollback.
                detail = self.match_detail(resume, jd)
                detail.result.gap_analysis.append(
                    "片段缓存不可用；已退回内存语义/关键词路径，详见评分依据。"
                )
                return detail
        return enhance(
            self.keyword_match(resume, jd), resume, jd, self.embedding, self.semantic_weight
        )

    def keyword_match(self, resume: Resume, jd: JD) -> MatchResult:
        resume = Resume.model_validate(resume.model_dump(warnings=False))
        jd = JD.model_validate(jd.model_dump(warnings=False))
        # Structured fields are authoritative (possibly edited by the user).
        # Never silently add requirements or resume skills back from old raw text.
        have, need = canonicalize(resume.skills), canonicalize(jd.skills)
        matched = sorted((label for key, label in need.items() if key in have), key=normalized)
        missing = sorted((label for key, label in need.items() if key not in have), key=normalized)
        score = round(100 * len(matched) / len(need), 2) if need else 0.0
        if need:
            explanation = [
                f"关键词覆盖率：{len(matched)}/{len(need)} × 100 = {score:g}%。"
                "技能与工具等权；大小写及等价别名归一化、去重。",
                f"缺失关键词共 {len(missing)} 项，详见缺失清单。",
                "仅衡量已确认结构化关键词覆盖，不代表录用概率或实际能力；未启用向量增强。",
            ]
        else:
            explanation = [
                "JD 无可识别或已确认的关键词，无法有效评估；0 为占位值，不表示能力为零。",
                "请补充明确的技能/工具要求后重新匹配；未启用向量增强。",
            ]
        return MatchResult(
            resume_id=resume.id,
            jd_id=jd.id,
            score=score,
            matched_skills=matched,
            missing_skills=missing,
            gap_analysis=explanation,
        )
