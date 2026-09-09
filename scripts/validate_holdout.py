"""Validate frozen acceptance sources without tuning or invoking D's algorithms."""

import hashlib
import json
import re
from pathlib import Path

from backend.core.config import ROOT
from backend.schemas.contracts import JDCreate, TextInput


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def validate(directory: Path):
    manifest = load(directory / "manifest.json")
    old_urls, old_texts = set(), set()
    for path in (ROOT / "data/jd").glob("*.json"):
        for row in load(path):
            old_urls.add(row.get("source_url"))
            old_texts.add(sha(row["raw_text"]))
    seen = set()
    for kind in ("jd", "resumes"):
        for relative in manifest[kind]:
            row = load(directory / relative)
            assert row["source_url"] not in seen, "duplicate source"
            seen.add(row["source_url"])
            snapshot = (directory / row["source_snapshot"]).read_text(encoding="utf-8")
            assert sha(snapshot) == row["source_sha256"], "source snapshot changed"
            value = row["jd_text" if kind == "jd" else "raw_text"]
            assert sha(value) == row["text_sha256"], "acceptance text changed"
            if kind == "jd":
                assert row["source_type"] == "real_web"
                assert row["source_url"] not in old_urls and sha(value) not in old_texts
                JDCreate.model_validate(
                    {
                        **{k: v for k, v in row.items() if k in JDCreate.model_fields},
                        # Preserve frozen provenance; translate the archive label to the API enum.
                        "source_type": "real",
                    }
                )
            else:
                assert row["source_type"] == "public_student_resume"
                assert row["student_status_evidence"] and len(row["source_commit"]) == 40
                assert "MIT" in (directory / row["license_file"]).read_text(encoding="utf-8")
                assert not re.search(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", value + snapshot)
                TextInput(raw_text=value)
    assert len(manifest["jd"]) >= 5 and len(manifest["resumes"]) >= 3
    print(
        f"PASS: {len(manifest['jd'])} independent real JD + {len(manifest['resumes'])} public student resumes; source hashes, licenses, contracts, no old JD overlap"
    )


if __name__ == "__main__":
    validate(ROOT / "data/holdout/2026-09-08")
