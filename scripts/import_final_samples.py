"""Validate or explicitly import the fixed final market supplement; never scrape at runtime."""

import argparse
import hashlib
import json

from sqlalchemy.orm import Session

from backend.core.config import ROOT, Settings
from backend.core.database import build_engine
from backend.core.migrations import migrate
from backend.core.providers import load_provider
from backend.core.services import parse_job_data
from backend.models.entities import JDRow
from backend.schemas.contracts import JDCreate


def load_samples():
    rows = json.loads((ROOT / "data/market/2026-09-08/samples.json").read_text(encoding="utf-8"))
    samples = [
        JDCreate.model_validate({k: v for k, v in row.items() if k in JDCreate.model_fields})
        for row in rows
    ]
    assert len(samples) == 5 and len({row.source_url for row in samples}) == 5
    assert all(row.source_type == "real" and row.collected_at for row in samples)
    assert sum(row.salary_period == "year" for row in samples) == 4
    return samples


def import_samples(session, provider):
    if provider.is_mock:
        raise ValueError("真实样本要求真实 Jobs provider")
    created, ids = 0, []
    for sample in load_samples():
        identity = f"{sample.source_url}\n{sample.collected_at}\n{sample.jd_text}"
        identifier = "jd_market_final_" + hashlib.sha256(identity.encode()).hexdigest()[:24]
        if session.get(JDRow, identifier) is None:
            session.add(
                JDRow(
                    id=identifier,
                    payload=parse_job_data(provider, sample).model_dump(mode="json"),
                    is_mock=False,
                )
            )
            session.flush()
            created += 1
        ids.append(identifier)
    return {"created": created, "existing": len(ids) - created, "jd_ids": ids}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="写入当前 T5_DATABASE_URL；默认只校验文件"
    )
    args = parser.parse_args()
    samples = load_samples()
    if not args.apply:
        print(f"PASS: {len(samples)} real source summaries; 4 USD/year, 1 unknown period")
        return
    settings = Settings()
    provider = load_provider("jobs", settings.jobs_provider)
    engine = build_engine(settings.database_url)
    try:
        migrate(engine)
        with Session(engine) as session, session.begin():
            report = import_samples(session, provider)
        print(json.dumps(report))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
