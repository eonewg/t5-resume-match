"""Authorized five-case, one-call evaluation; never persist full input or model output."""

import argparse
import hashlib
import json
import re
import time
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

from backend.modules.resume.ai import (
    ExtractedFacts,
    ResumeAIError,
    ResumeAIService,
    strict_json,
    transport,
)
from backend.modules.resume.config import ResumeSettings
from backend.schemas.contracts import TextInput

ROOT = Path(__file__).resolve().parents[2]
HOST = "llm-bv7d9xyk1b4exmh3.cn-beijing.maas.aliyuncs.com"
IDS = ("student-01", "student-02", "student-03", "stefano-user", "mixed-representative")


def prepare(sample):
    source = sample["input"]
    raw = (ROOT / source["path"]).read_text(encoding="utf-8")
    if source["format"] == "json":
        raw = json.loads(raw)[source["text_key"]]
    edits = {}

    def replace(label, pattern, replacement, flags=0):
        nonlocal raw
        raw, count = re.subn(pattern, replacement, raw, flags=flags)
        if count:
            edits[label] = edits.get(label, 0) + count

    # The three public samples already omit applicant/contact headers. PI/Advisor names remain.
    replace("mentor_names", r"(?m)((?:PI|Advisor):\s*)[^\r\n;]+", r"\1Mentor A")
    expected_name = sample["expected"]["name"]
    if sample["id"] == "stefano-user":
        original_name = expected_name["accepted"][0]
        replace("applicant_name", re.escape(original_name), "张同学 (Student A)")
        expected_name = {"kind": "explicit", "accepted": ["张同学 (Student A)"]}
    replace("email", r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "student@example.com")
    replace("phone", r"(?<!\d)1[3-9]\d[- ]?\d{4}[- ]?\d{4}(?!\d)", "138-0000-0000")
    replace("github_account", r"github\.com/[\w.-]+", "github.com/example-user", re.I)
    replace("linkedin_account", r"linkedin\.com/in/[\w.-]+", "linkedin.com/in/example-user", re.I)
    replace("homepage", r"(个人主页[:：]\s*)\S+", r"\1example.com")
    # Fail closed for unreviewed ID/contact forms; dates and outcome numbers are not removed.
    if re.search(r"(?i)身份证|学号|student\s*id|\bssn\b|\b\d{17}[\dXx]\b", raw):
        raise ValueError("unreviewed_identifier")
    if re.search(
        r"(?i)(?:https?://)?(?:www\.)?(?:github\.com|linkedin\.com)/(?!example-user|in/example-user)",
        raw,
    ):
        raise ValueError("unreviewed_account")
    if re.search(r"(?m)(?:PI|Advisor):\s*(?!Mentor A)[A-Z]", raw):
        raise ValueError("unreviewed_person")
    assert len(raw.splitlines()) == len(
        (
            json.loads((ROOT / source["path"]).read_text(encoding="utf-8"))[source["text_key"]]
            if source["format"] == "json"
            else (ROOT / source["path"]).read_text(encoding="utf-8")
        ).splitlines()
    )
    return raw, edits, expected_name


def normalize(text):
    """Normalize evaluation anchors only; never a production acceptance check."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text).casefold())


def metrics(facts, raw, sample, expected_name):
    expected = sample["expected"]
    skills = facts["skills"]
    required = expected["skills_required"]
    covered = []
    for group in required:
        if any(
            normalize(alias) == normalize(skill)
            for alias in group["accepted_aliases"]
            for skill in skills
        ):
            covered.append(group["canonical"])
    education_missing = [
        s
        for s in expected["education_required_evidence"]
        if normalize(s) not in normalize(facts["education"])
    ]
    passages = facts["experience"]
    joined = "\n".join(passages)
    missing_experience = [
        s for s in expected["experience_required_titles"] if normalize(s) not in normalize(joined)
    ]
    missing_numbers = [
        s for s in expected["numeric_fact_evidence"] if normalize(s) not in normalize(joined)
    ]
    name_ok = (
        facts["name"] is None
        if expected_name["kind"] == "empty"
        else any(normalize(facts["name"] or "") == normalize(s) for s in expected_name["accepted"])
    )
    return {
        "name_correct": name_ok,
        "education_missing_exact_anchors": education_missing,
        "skills_predicted": skills,
        "skill_required_covered": len(covered),
        "skill_required_count": len(required),
        "skill_required_recall": len(covered) / len(required),
        "skill_missing_groups": [g["canonical"] for g in required if g["canonical"] not in covered],
        "forbidden_skills": [
            s
            for s in skills
            if normalize(s) in {normalize(x) for x in expected["skills_forbidden"]}
        ],
        "experience_count": len(passages),
        "experience_missing_exact_titles": missing_experience,
        "numeric_missing_exact_anchors": missing_numbers,
        "experience_short_excerpts": [s[:90] for s in passages[:5]],
        "review_status": "requires_semantic_review_not_automatic_pass",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--ledger", required=True)
    args = parser.parse_args()
    manifest = json.loads(
        (ROOT / "tests/resume/fixtures/ai-evaluation/manifest.json").read_text(encoding="utf-8")
    )
    samples = manifest["samples"]
    assert tuple(s["id"] for s in samples) == IDS
    prepared = [(s, *prepare(s)) for s in samples]
    settings = ResumeSettings(_env_file=args.env_file, llm_timeout=120)
    assert urlsplit(settings.endpoint).hostname == HOST and settings.llm_model == "glm-5.2"
    assert settings.api_style == "chat_completions" and settings.structured_output == "json_schema"
    report = {
        "at": datetime.now(UTC).isoformat(),
        "model": "glm-5.2",
        "destination_host": HOST,
        "policy": "five reviewed redacted texts; one call each; no retries; no full bodies retained",
        "samples": [],
    }
    for sample, raw, edits, _name in prepared:
        report["samples"].append(
            {
                "id": sample["id"],
                "redactions": edits,
                "chars": len(raw),
                "sanitized_sha256": hashlib.sha256(raw.encode()).hexdigest(),
                "status": "privacy_reviewed_not_sent",
                "calls": 0,
            }
        )
    if not args.execute:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return
    ledger = Path(args.ledger)
    # Exclusive creation prevents accidental reruns of this specifically authorized batch.
    with ledger.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    for (sample, raw, _edits, expected_name), row in zip(prepared, report["samples"], strict=True):
        captured = {}

        def send(endpoint, payload, headers, timeout, raw=raw, row=row, captured=captured):
            assert urlsplit(endpoint).hostname == HOST and payload["model"] == "glm-5.2"
            assert payload["messages"][1]["content"] == raw
            row.update(calls=1, status="attempt_reserved")
            ledger.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            body = transport(endpoint, payload, headers, timeout)
            try:
                value = strict_json(strict_json(body)["choices"][0]["message"]["content"])
                captured["facts"] = ExtractedFacts.model_validate(value).model_dump()
            except Exception:
                pass
            return body

        started = time.monotonic()
        try:
            result = ResumeAIService(settings, send).parse(TextInput(raw_text=raw))
            row.update(status="accepted_by_parser", raw_preserved=result.raw_text == raw)
        except ResumeAIError as exc:
            row.update(status="rejected_by_parser", error_code=exc.code, raw_preserved=None)
        row["elapsed_seconds"] = round(time.monotonic() - started, 2)
        if "facts" in captured:
            row["candidate_metrics"] = metrics(captured["facts"], raw, sample, expected_name)
        ledger.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(
            row["id"], row["status"], row.get("error_code", ""), row["elapsed_seconds"], flush=True
        )
        captured.clear()


if __name__ == "__main__":
    main()
