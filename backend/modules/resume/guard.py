"""Conservative checks for obvious additions, not a second layout parser."""

import re
import unicodedata


def normalize(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text).casefold())


def numbers(text: str) -> set[str]:
    text = unicodedata.normalize("NFKC", text).casefold()
    text = re.sub(r"(?<=\d),(?=\d{3}(?:\D|$))", "", text)
    return {
        re.sub(r"\s+", "", match.group())
        for match in re.finditer(
            r"\d+(?:\.\d+)?\+?(?:\s*(?:%|qps|tps|ms|万人|人|万|亿|倍|小时|分钟|秒))?", text
        )
    }


def skill_evidence(skill: str, raw: str) -> bool:
    # Combined names can differ in spacing and slash symbols without becoming new skills.
    parts = re.split(r"[/／、]", unicodedata.normalize("NFKC", skill))
    for part in parts:
        term = re.sub(r"\s*([.+#/-])\s*", r"\1", part.casefold().strip())
        if not term:
            return False
        pattern = re.compile(
            r"(?<![a-z0-9_+#])" + re.escape(term).replace(r"\ ", r"\s+") + r"(?![a-z0-9_+#])"
        )
        found = False
        # Sentence/contrast boundaries keep a later learning plan from negating an
        # earlier skill. A dot inside Node.js or .NET is not a sentence boundary.
        for clause in re.split(r"[\n。；;，,]|\.(?=\s|$)|\bbut\b", raw, flags=re.IGNORECASE):
            normalized = normalize(clause)
            evidence = unicodedata.normalize("NFKC", clause).casefold()
            if pattern.search(evidence) and not re.search(
                r"计划|打算|准备学习|希望学习|尚未|不了解|不熟悉|未掌握|不会|"
                r"plantolearn|planningto|notfamiliar|donotknow|neverused|wanttolearn|"
                r"noexperience|withoutexperience|notexperienced|havenotused|haven'tused|don'tknow",
                normalized,
            ):
                found = True
                break
        if not found:
            return False
    return True


def supported_passage(passage: str, raw: str) -> bool:
    text, source = normalize(passage), normalize(raw)
    if not text or text in source:
        return True
    # Formatting and modest connective-word changes are allowed; large novel passages fail.
    grams = {text[i : i + 2] for i in range(len(text) - 1) if text[i : i + 2].isalnum()}
    return bool(grams) and sum(gram in source for gram in grams) / len(grams) >= 0.65


def facts_supported(data: dict, raw: str) -> bool:
    if data["name"] is not None and normalize(data["name"]) not in normalize(raw):
        return False
    if any(not skill_evidence(skill, raw) for skill in data["skills"]):
        return False
    source_numbers = numbers(raw)
    for passage in [data["education"], *data["experience"]]:
        if not numbers(passage).issubset(source_numbers) or not supported_passage(passage, raw):
            return False
    return True
