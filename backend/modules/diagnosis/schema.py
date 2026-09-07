import json
import re
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


def parse_detail(raw: str, resume_text: str) -> DiagnosisDetail:
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
    for rewrite in detail.star_rewrites:
        if rewrite.original not in resume_text:
            raise InvalidOutputError("STAR 原文必须来自输入简历")

        # Guard unsupported Arabic numbers, including percentages and durations.
        # This is a guardrail, not proof of factual accuracy; human review remains necessary.
        def numbers(text):
            return set(re.findall(r"\d+(?:\.\d+)?%?", text))

        if not numbers(rewrite.optimized).issubset(numbers(rewrite.original)):
            raise InvalidOutputError("STAR 改写包含原文未提供的数字")
    return detail
