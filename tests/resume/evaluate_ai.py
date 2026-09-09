"""Opt-in live evaluation: python -m tests.resume.evaluate_ai [--sample ID].

Only fixture raw_text goes to the model. Output is evidence, not automatic semantic PASS.
"""

import argparse
import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path

from backend.modules.resume.ai import ResumeAIError, ResumeAIService
from backend.modules.resume.config import ResumeSettings
from backend.schemas.contracts import TextInput

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "tests/resume/fixtures/ai-evaluation/manifest.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample")
    parser.add_argument("--output", default=".verification/resume-ai-evaluation")
    args = parser.parse_args()
    output = ROOT / args.output
    output.mkdir(parents=True, exist_ok=True)
    settings = ResumeSettings()
    service = ResumeAIService(settings)
    for sample in json.loads(MANIFEST.read_text(encoding="utf-8"))["samples"]:
        if args.sample and sample["id"] != args.sample:
            continue
        source = sample["input"]
        raw = (ROOT / source["path"]).read_text(encoding="utf-8")
        if source["format"] == "json":
            raw = json.loads(raw)[source["text_key"]]
        started = time.monotonic()
        report = {
            "sample": sample["id"],
            "provenance": sample["provenance"],
            "at": datetime.now(UTC).isoformat(),
            "model": settings.llm_model,
            "protocol": settings.api_style,
            "structured_output": settings.structured_output,
            "input_sha256": hashlib.sha256(raw.encode()).hexdigest(),
        }
        try:
            result = service.parse(TextInput(raw_text=raw))
            report.update(
                status="extracted_pending_semantic_review",
                raw_preserved=result.raw_text == raw,
                result=result.model_dump(exclude={"raw_text"}),
            )
        except ResumeAIError as exc:
            report.update(status="failed", error_code=exc.code)
        report["elapsed_seconds"] = round(time.monotonic() - started, 2)
        (output / (sample["id"] + ".json")).write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(
            sample["id"],
            report["status"],
            report.get("error_code", ""),
            report["elapsed_seconds"],
            flush=True,
        )


if __name__ == "__main__":
    main()
