"""Explicit one-round live revalidation. Never invoked by pytest; never overwrite evidence."""

import argparse
import hashlib
import json
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

from backend.modules.diagnosis.client import create_client
from backend.modules.diagnosis.config import DiagnosisSettings
from backend.modules.diagnosis.errors import DiagnosisError
from backend.modules.diagnosis.public import DiagnosisService
from backend.schemas.contracts import DiagnosisInput

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data/evaluation/star-supplement-2026-09-08/operator-record.json"
OUT = Path(__file__).parent / "evidence/reliability-fix-2026-09-09.json"


def digest(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-once", action="store_true", required=True)
    parser.parse_args()
    historical = json.loads(SOURCE.read_text(encoding="utf-8"))
    # Explicitly freeze the new reliability defaults, not a new model or prompt.
    settings = DiagnosisSettings(
        timeout_seconds=45,
        connect_timeout_seconds=5,
        read_timeout_seconds=40,
        total_timeout_seconds=95,
        max_attempts=2,
        output_retries=0,
        backoff_seconds=1,
        retry_after_cap_seconds=5,
    )
    original = historical["configuration"]
    for name in ("llm_vendor", "api_style", "model", "reasoning_effort", "max_tokens"):
        assert getattr(settings, name) == original[name], f"Frozen {name} changed"
    assert settings.api_key.get_secret_value(), "Configure the local key; do not print it"
    assert digest(settings.endpoint.encode()) == original["endpoint_sha256"], "Endpoint changed"
    prompt = (ROOT / "backend/modules/diagnosis/prompts.py").read_bytes().replace(b"\r\n", b"\n")
    historic_prompt = subprocess.check_output(
        ["git", "show", historical["code_sha"] + ":backend/modules/diagnosis/prompts.py"], cwd=ROOT
    ).replace(b"\r\n", b"\n")
    assert prompt == historic_prompt, "Prompt content changed"
    assert original["prompt_sha256"] in (digest(prompt), digest(prompt.replace(b"\n", b"\r\n"))), (
        "Historical prompt fingerprint mismatch"
    )
    preserved = {
        path.relative_to(ROOT).as_posix(): digest(path.read_bytes())
        for path in (ROOT / "data/evaluation").rglob("*")
        if path.is_file()
    }
    report = {
        "kind": "single_formal_reliability_fix_round",
        "started_at": datetime.now(UTC).isoformat(),
        "baseline": "ac79807846b2ec928aba0d77e439e8ff676d81b1",
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "source_sha256": digest(SOURCE.read_bytes()),
        "prompt_lf_sha256": digest(prompt),
        "prompt_historical_crlf_sha256": original["prompt_sha256"],
        "preflight_note": "First preflight stopped before any API call: historical fingerprint used CRLF; Git prompt content is identical. Both newline hashes verified.",
        "code_hashes": {
            path.relative_to(ROOT).as_posix(): digest(path.read_bytes())
            for path in sorted((ROOT / "backend/modules/diagnosis").glob("*.py"))
        },
        "git_head": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "configuration": settings.model_dump(
            exclude={"api_key", "legacy_api_key", "base_url", "endpoint_path"}
        ),
        "endpoint_sha256": original["endpoint_sha256"],
        "worst_case_seconds": settings.worst_case_seconds,
        "cases": [],
    }
    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("x", encoding="utf-8") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)

    def save():
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    for fixed in historical["cases"]:
        inputs = [fixed["resume_text"], fixed["jd_text"]]
        assert digest(json.dumps(inputs, ensure_ascii=False).encode()) == fixed["input_sha256"]
        attempts, wire = [], []
        case = {"id": fixed["id"], "input_sha256": fixed["input_sha256"], "status": "started"}
        report["cases"].append(case)
        save()  # Interrupted or failed rounds cannot silently resume/repeat.
        service = DiagnosisService(
            create_client(settings, on_attempt=wire.append),
            settings=settings,
            on_attempt=attempts.append,
        )
        started = time.monotonic()
        try:
            result = service.diagnose_detail(
                DiagnosisInput(resume_text=inputs[0], jd_text=inputs[1])
            )
            case.update(
                status="validated",
                result=result.model_dump(),
                is_mock=service.is_mock,
                automated_fact_number_guard=True,
                star_count=len(result.star_rewrites),
            )
        except DiagnosisError as error:
            case.update(status="failed", error_type=type(error).__name__, **error.metadata())
        except Exception:
            case.update(status="failed", error_category="unknown")
        case.update(
            elapsed_seconds=round(time.monotonic() - started, 3),
            attempts=attempts,
            transport_attempts=wire,
        )
        save()
        print(json.dumps({k: case[k] for k in ("id", "status", "elapsed_seconds")}), flush=True)
    report["historical_evidence_unchanged"] = preserved == {
        path.relative_to(ROOT).as_posix(): digest(path.read_bytes())
        for path in (ROOT / "data/evaluation").rglob("*")
        if path.is_file()
    }
    save()
    assert report["historical_evidence_unchanged"]


if __name__ == "__main__":
    main()
