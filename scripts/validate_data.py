"""Validate T5 data assets under data/ and local links in new docs.

Stdlib only. Run: uv run python scripts/validate_data.py
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

JD_REQUIRED = (
    "id",
    "category",
    "title",
    "company",
    "location",
    "salary_raw",
    "salary_min",
    "salary_max",
    "salary_unit",
    "raw_text",
    "skills_manual",
    "tools_manual",
    "source_type",
    "source_name",
    "source_url",
    "collected_at",
    "notes",
)
CATEGORIES = {"数据分析", "数据科学", "AI算法", "后端开发", "大数据", "数据产品"}
MATCH_LEVELS = {"low", "medium", "high"}
BASELINE_REQUIRED = (
    "resume_id",
    "jd_id",
    "matched_skills_manual",
    "missing_skills_manual",
    "expression_gaps_manual",
    "skill_gaps_manual",
    "suggested_keywords_manual",
    "match_level_manual",
)

PHONE_RE = re.compile(r"1[3-9]\d{9}")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.\-]+")
ID_RE = re.compile(r"\d{17}[\dXx]")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

NEW_DOCS = (
    "data/README.md",
    "data/collection/collection-log.md",
    "docs/competitor-analysis.md",
    "docs/market-pain-points.md",
    "docs/integration_requests/D-data-handoff.md",
)

errors: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        errors.append(msg)


def load_json(rel: str):
    path = ROOT / rel
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{rel}: invalid JSON ({exc})")
        return None


def salary_ok(jd: dict) -> bool:
    lo, hi, unit = jd["salary_min"], jd["salary_max"], jd["salary_unit"]
    if lo is None and hi is None and unit is None:
        return True
    return (
        isinstance(lo, (int, float))
        and isinstance(hi, (int, float))
        and 0 < lo <= hi
        and unit == "K/月"
    )


def validate_jd(rel: str, expect_source: str) -> list[dict]:
    data = load_json(rel)
    if not isinstance(data, list):
        return []
    for i, jd in enumerate(data):
        tag = f"{rel}[{i}]"
        for field in JD_REQUIRED:
            check(field in jd, f"{tag}: missing field {field}")
        check(jd.get("source_type") == expect_source, f"{tag}: source_type must be {expect_source}")
        check(jd.get("category") in CATEGORIES, f"{tag}: bad category {jd.get('category')!r}")
        check(bool(jd.get("raw_text", "").strip()), f"{tag}: empty raw_text")
        check(isinstance(jd.get("skills_manual"), list), f"{tag}: skills_manual not a list")
        check(isinstance(jd.get("tools_manual"), list), f"{tag}: tools_manual not a list")
        check(bool(DATE_RE.fullmatch(jd.get("collected_at", ""))), f"{tag}: bad collected_at")
        check(salary_ok(jd), f"{tag}: salary fields inconsistent")
        url = jd.get("source_url")
        if expect_source == "real_web":
            check(
                isinstance(url, str) and url.startswith("https://"),
                f"{tag}: real JD needs https source_url",
            )
            check(bool(jd.get("source_name")), f"{tag}: real JD needs source_name")
        else:
            check(url is None, f"{tag}: non-real JD must have null source_url")
    return data


def iter_text(node, hits: list[str]) -> None:
    if isinstance(node, str):
        hits.append(node)
    elif isinstance(node, list):
        for item in node:
            iter_text(item, hits)
    elif isinstance(node, dict):
        for value in node.values():
            iter_text(value, hits)


def validate_resume(rel: str, seen_ids: set[str]) -> None:
    data = load_json(rel)
    if not isinstance(data, dict):
        return
    tag = rel
    check(data.get("anonymized") is True, f"{tag}: anonymized must be true")
    check(
        data.get("source_type") in {"real_anonymized", "public", "course", "synthetic"},
        f"{tag}: bad source_type {data.get('source_type')!r}",
    )
    check(
        bool(str(data.get("raw_text_anonymized", "")).strip()), f"{tag}: empty raw_text_anonymized"
    )
    check(bool(data.get("education")), f"{tag}: missing education")
    check(isinstance(data.get("experiences"), list), f"{tag}: experiences not a list")
    check(isinstance(data.get("projects"), list), f"{tag}: projects not a list")
    check(isinstance(data.get("skills"), list), f"{tag}: skills not a list")
    check(bool(data.get("notes")), f"{tag}: missing anonymization notes")
    rid = data.get("id")
    check(rid not in seen_ids, f"{tag}: duplicate resume id {rid!r}")
    if isinstance(rid, str):
        seen_ids.add(rid)
    texts: list[str] = []
    iter_text(data, texts)
    blob = "\n".join(texts)
    check(PHONE_RE.search(blob) is None, f"{tag}: possible phone number found")
    check(EMAIL_RE.search(blob) is None, f"{tag}: possible email found")
    check(ID_RE.search(blob) is None, f"{tag}: possible national ID found")


def validate_baseline(jd_ids: set[str], resume_ids: set[str]) -> None:
    data = load_json("data/baselines/gap-baseline.json")
    if not isinstance(data, dict):
        return
    pairs = data.get("pairs", [])
    check(data.get("reviewer") == "manual(A)", "baseline: top-level reviewer must be manual(A)")
    check(len(pairs) >= 15, f"baseline: expected >=15 pairs, got {len(pairs)}")
    seen_pairs: set[str] = set()
    used_jd: set[str] = set()
    used_resume: set[str] = set()
    for i, pair in enumerate(pairs):
        tag = f"baseline pairs[{i}]"
        for field in BASELINE_REQUIRED:
            check(field in pair, f"{tag}: missing field {field}")
        pid = pair.get("pair_id")
        check(pid not in seen_pairs, f"{tag}: duplicate pair_id {pid!r}")
        if isinstance(pid, str):
            seen_pairs.add(pid)
        check(
            pair.get("resume_id") in resume_ids,
            f"{tag}: unknown resume_id {pair.get('resume_id')!r}",
        )
        check(pair.get("jd_id") in jd_ids, f"{tag}: unknown jd_id {pair.get('jd_id')!r}")
        check(
            pair.get("match_level_manual") in MATCH_LEVELS,
            f"{tag}: bad match_level {pair.get('match_level_manual')!r}",
        )
        check(
            bool(pair.get("matched_skills_manual")) or bool(pair.get("missing_skills_manual")),
            f"{tag}: both matched/missing empty",
        )
        check(bool(pair.get("notes")), f"{tag}: missing notes")
        used_jd.add(pair.get("jd_id"))
        used_resume.add(pair.get("resume_id"))
    check(len(used_jd) == 5, f"baseline: expected 5 core JDs, got {len(used_jd)}")
    check(len(used_resume) == 3, f"baseline: expected 3 core resumes, got {len(used_resume)}")

    csv_path = ROOT / "data/baselines/gap-baseline.csv"
    try:
        with csv_path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
    except OSError as exc:
        errors.append(f"gap-baseline.csv: unreadable ({exc})")
        return
    check(
        len(rows) == len(pairs),
        f"gap-baseline.csv: row count {len(rows)} != JSON pairs {len(pairs)}",
    )
    check(
        {row.get("pair_id") for row in rows} == seen_pairs,
        "gap-baseline.csv: pair_id mismatch vs JSON",
    )
    check(
        all(row.get("reviewer") == "manual(A)" for row in rows),
        "gap-baseline.csv: reviewer not manual(A)",
    )


def validate_doc_links() -> None:
    link_re = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
    for rel in NEW_DOCS:
        path = ROOT / rel
        if not path.exists():
            errors.append(f"missing doc file: {rel}")
            continue
        for match in link_re.finditer(path.read_text(encoding="utf-8")):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:")) or target.startswith("#"):
                continue
            clean = target.split("#", 1)[0]
            if not clean:
                continue
            check((path.parent / clean).exists(), f"{rel}: broken link -> {target}")


def main() -> int:
    real = validate_jd("data/jd/jd-real.json", "real_web")
    syn = validate_jd("data/jd/jd-synthetic.json", "synthetic")
    jd_ids = {jd.get("id") for jd in real + syn if isinstance(jd, dict)}
    check(len(jd_ids) == len(real) + len(syn), "duplicate JD ids across files")
    check(len(real) >= 5, f"real JD count {len(real)} below course minimum 5")
    check(len(real) + len(syn) >= 20, f"total JD count {len(real) + len(syn)} below recommended 20")

    resume_ids: set[str] = set()
    for index in range(1, 6):
        validate_resume(f"data/resumes/resume-{index:02d}.json", resume_ids)

    validate_baseline(jd_ids, resume_ids)
    validate_doc_links()

    if errors:
        print(f"FAIL: {len(errors)} problem(s)")
        for err in errors:
            print(f"  - {err}")
        return 1
    print(
        f"OK: {len(real) + len(syn)} JDs ({len(real)} real), 5 resumes, baseline pairs checked, docs linked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
