"""Conservative salary extraction: explicit compensation lines, no conversions."""

import math
import re

LABEL = re.compile(r"薪资|薪酬|工资|月薪|年薪|时薪|日薪|\b(?:salary|base pay|pay range)\b", re.I)
EXCLUDE = re.compile(r"预算|补贴|奖金|报销|budget|allowance|bonus|reimburse", re.I)
CURRENCIES = {
    "USD": "USD",
    "CNY": "CNY",
    "RMB": "CNY",
    "人民币": "CNY",
    "EUR": "EUR",
    "€": "EUR",
    "GBP": "GBP",
    "£": "GBP",
}
PERIODS = {
    "hour": r"/\s*(?:h\b|hour\b|小时)|per hour\b|hourly\b|时薪",
    "day": r"/\s*(?:day\b|天|日)|per day\b|日薪",
    "month": r"/\s*(?:month\b|月)|per month\b|monthly\b|月薪",
    "year": r"/\s*(?:year\b|年)|per year\b|annually\b|annual\b|年薪",
}
NUMBER = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
RANGE = re.compile(
    rf"(?<![\d.,])(?P<lo>{NUMBER})\s*(?P<lu>[kK万]?)\s*[-–—~至到]\s*(?:USD|CNY|RMB|EUR|GBP|[$€£])?\s*(?P<hi>{NUMBER})\s*(?P<hu>[kK万]?)(?![\d.,])"
)


def parse_salary(text: str) -> dict:
    candidates = [
        line.strip()
        for line in re.split(r"[\n;；。]", text)
        if LABEL.search(line) and not EXCLUDE.search(line)
    ]
    # Multiple regional offers / alternative packages are intentionally ambiguous.
    if len(candidates) != 1 or len(candidates[0]) > 2000:
        return {}
    line = candidates[0]
    ranges = list(RANGE.finditer(line))
    if not ranges and not re.search(r"面议|undisclosed|negotiable", line, re.I):
        return {}
    result = {"salary": line}
    currencies = {
        value
        for key, value in CURRENCIES.items()
        if re.search(re.escape(key) if not key.isascii() else rf"\b{key}\b", line, re.I)
    }
    # 元 is CNY only when the compensation explicitly says 人民币/CNY/RMB.
    # Bare $ / ¥ and unlabelled K must not imply a currency.
    if len(currencies) == 1:
        result["currency"] = currencies.pop()
    periods = [name for name, pattern in PERIODS.items() if re.search(pattern, line, re.I)]
    if len(periods) == 1:
        result["salary_period"] = periods[0]
    if len(ranges) != 1 or len(currencies) > 1 or len(periods) > 1:
        return result
    match = ranges[0]
    # Reject narrative numbers (e.g. salary review every 1-2 years), percentages,
    # negative amounts and unrelated quantities on a compensation line.
    prefix = LABEL.sub("", line[: match.start()])
    prefix = re.sub(
        r"\b(?:USD|CNY|RMB|EUR|GBP|annual|monthly|range|is|of)\b|人民币", "", prefix, flags=re.I
    )
    if prefix.strip(" \t:：$€£") or re.match(r"\s*[%％]", line[match.end() :]):
        return {}
    low_unit, high_unit = match["lu"], match["hu"]
    # 10–15K shares the trailing unit; 10K–15000 has explicit different scales.
    if not low_unit and high_unit:
        low_unit = high_unit
    factor = {"": 1, "k": 1000, "万": 10000}
    low = float(match["lo"].replace(",", "")) * factor[low_unit.lower()]
    high = float(match["hi"].replace(",", "")) * factor[high_unit.lower()]
    if math.isfinite(low) and math.isfinite(high) and low <= high:
        result.update(salary_min=low, salary_max=high)
    return result
