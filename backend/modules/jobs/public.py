from dataclasses import dataclass

from backend.schemas.contracts import JD, JDData, JDInput, MatchResult, Resume

from .keywords import TOOLS, canonicalize, extract, normalized


@dataclass(frozen=True)
class JDDetails:
    title: str
    raw_text: str
    skills: tuple[str, ...]
    tools: tuple[str, ...]


class JobsService:
    is_mock = False

    def parse(self, data: JDInput) -> JDData:
        original = data.model_dump(warnings=False) if isinstance(data, JDInput) else data
        checked = JDInput.model_validate(original)
        # Public validation trims for validity; preserve the caller's original text values.
        result = JDData(**checked.model_dump(), skills=extract(checked.jd_text))
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
