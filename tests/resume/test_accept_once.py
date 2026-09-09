"""Privacy preflight regression only; never calls the model."""

import hashlib
import json
import re

from tests.resume.accept_once import IDS, ROOT, prepare


def test_five_case_preflight_preserves_structure_and_removes_direct_contacts():
    manifest = json.loads(
        (ROOT / "tests/resume/fixtures/ai-evaluation/manifest.json").read_text(encoding="utf-8")
    )
    assert tuple(sample["id"] for sample in manifest["samples"]) == IDS
    for sample in manifest["samples"]:
        path = ROOT / sample["input"]["path"]
        before = path.read_bytes()
        raw, edits, expected_name = prepare(sample)
        assert hashlib.sha256(path.read_bytes()).digest() == hashlib.sha256(before).digest()
        assert raw.strip()
        assert all(anchor in raw for anchor in sample["expected"]["numeric_fact_evidence"])
        assert all(title in raw for title in sample["expected"]["experience_required_titles"])
        if sample["id"] == "stefano-user":
            assert "张同学 (Student A)" in raw
            assert "github.com/example-user" in raw
            assert expected_name["accepted"] == ["张同学 (Student A)"]
            assert edits["applicant_name"] == 1 and edits["github_account"] == 4
        if sample["id"] in {"student-02", "student-03"}:
            assert edits["mentor_names"] >= 1
            assert not re.search(r"(?:PI|Advisor):\s*(?!Mentor A)[A-Z]", raw)
