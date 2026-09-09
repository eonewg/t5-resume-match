import json
import re
from collections.abc import Callable
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from .errors import InvalidOutputError

Content = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=3000)
]
Keyword = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=100)
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class StarRewrite(StrictModel):
    original: Content
    optimized: Content
    reason: Content


class DiagnosisDetail(StrictModel):
    summary: Content
    star_rewrites: list[StarRewrite] = Field(max_length=5)
    jd_targeted_suggestions: list[Content] = Field(min_length=1, max_length=10)
    keywords_to_strengthen: list[Keyword] = Field(max_length=20)
    risks: list[Content] = Field(min_length=1, max_length=10)


FILTER_WARNING = "部分 STAR 改写因事实保护未展示，请以原简历事实为准。"


def parse_detail(
    raw: str, resume_text: str, *, on_filtered: Callable[[dict[str, int]], None] | None = None
) -> DiagnosisDetail:
    if not isinstance(raw, str) or not raw.strip() or len(raw) > 64000:
        raise InvalidOutputError("模型输出为空或过长")
    raw = raw.strip()
    if raw.startswith("```"):
        match = re.fullmatch(r"```(?:json)?\s*\n?(.*?)\n?```", raw, re.DOTALL)
        if match:
            raw = match.group(1)
    try:
        detail = DiagnosisDetail.model_validate(json.loads(raw))
    except (ValueError, ValidationError, RecursionError):
        raise InvalidOutputError("模型输出不符合诊断 JSON 结构") from None
    kept = []
    counts = {"fact_guard_original": 0, "fact_guard_number": 0}
    for rewrite in detail.star_rewrites:
        if rewrite.original not in resume_text:
            counts["fact_guard_original"] += 1
            continue

        # Keep the existing per-original Arabic-number rule unchanged.
        def numbers(text):
            return set(re.findall(r"\d+(?:\.\d+)?%?", text))

        if not numbers(rewrite.optimized).issubset(numbers(rewrite.original)):
            counts["fact_guard_number"] += 1
            continue
        kept.append(rewrite)
    detail.star_rewrites = kept
    if any(counts.values()):
        # Preserve all model risks. The optional notice must not exceed schema limits.
        if len(detail.risks) < 10 and FILTER_WARNING not in detail.risks:
            detail.risks.append(FILTER_WARNING)
        if on_filtered is not None:
            on_filtered(counts)
    return detail
