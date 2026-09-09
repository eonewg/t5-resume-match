"""Conservative clause exclusions, not a claim of complete negation understanding."""

import re
import unicodedata
from dataclasses import dataclass

PREPROCESSING_VERSION = "t5-clauses-v2"
NEGATIVE = re.compile(
    r"不要求|无需|不需要|不具备|没有|从未|未曾|尚未|不会|不熟悉|未掌握|未使用|未实践|未做过"
    r"|\b(?:not|never|without|lack|lacking)\b|\bno\s+(?:experience|knowledge|need)\b",
    re.I,
)
INTENT = re.compile(
    r"正在学习|学习中|希望|计划|打算|期望|想要|准备学习"
    r"|\b(?:hope|hoping|plan|planning|aspire|aspiring)\b"
    r"|\b(?:currently|still|am|is|are)\s+learning\b|\blearning\s+(?:how|to)\b|^learning\b"
    r"|\b(?:want to|would like|interested in)\b",
    re.I,
)
IRRELEVANT = re.compile(
    r"福利|五险|年假|团建|公司介绍|关于我们|我们是一家|公司成立"
    r"|\b(?:benefits|about us|we offer|our company|paid leave|insurance)\b",
    re.I,
)


@dataclass(frozen=True)
class FilteredText:
    kept: tuple[str, ...]
    excluded: tuple[tuple[str, str], ...]


def filter_clauses(texts: list[str], *, jd: bool = False) -> FilteredText:
    kept, excluded = [], []
    for text in texts:
        text = unicodedata.normalize("NFKC", text)
        # Filter before chunk windows, so a long negative sentence cannot leak its tail.
        for clause in re.split(r"[。！？!?；;\n]+|(?<=[A-Za-z])\.(?=\s|$)", text):
            clause = " ".join(clause.split()).strip()
            if not clause:
                continue
            reason = (
                "否定/未具备"
                if NEGATIVE.search(clause)
                else "学习/意向"
                if INTENT.search(clause)
                else "福利/公司介绍"
                if jd and IRRELEVANT.search(clause)
                else None
            )
            if reason:
                excluded.append((clause, reason))
            else:
                kept.append(clause)
    return FilteredText(tuple(kept), tuple(excluded))
