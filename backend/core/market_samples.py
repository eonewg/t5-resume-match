"""Explicit, repeatable import of the five archived real JD snapshots through public ports."""

import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from backend.core.config import ROOT
from backend.core.services import parse_job_data
from backend.models.entities import JDRow
from backend.schemas.contracts import JDCreate, SampleImportResult


def import_sample_jobs(session, provider) -> SampleImportResult:
    if provider.is_mock:
        raise HTTPException(409, "请先启用真实 JD 解析，再导入真实快照。")
    if session.get_bind().dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(5450002)"))
    created, identifiers = 0, []
    existing = list(session.scalars(select(JDRow)))
    for index in range(1, 6):
        path = ROOT / f"data/holdout/2026-09-08/jd/holdout-jd-{index:02d}.json"
        sample = json.loads(path.read_text(encoding="utf-8"))
        data = JDCreate(
            title=sample["title"],
            company=sample["company"],
            jd_text=sample["jd_text"],
            source_type="real",
            source_url=sample["source_url"],
            source_name="Canonical · Greenhouse 公开招聘快照",
            collected_at=sample["collected_at"],
            **{
                key: sample[key]
                for key in ("salary", "salary_min", "salary_max", "currency", "salary_period")
            },
        )
        # Idempotence is limited to the same source + exact text + provenance, never all job titles.
        previous = next(
            (
                row
                for row in existing
                if not row.is_mock
                and row.payload.get("source_type") == "real"
                and row.payload.get("source_url") == data.source_url
                and row.payload.get("collected_at") == data.collected_at.isoformat()
                and row.payload.get("jd_text") == data.jd_text
            ),
            None,
        )
        if previous:
            identifiers.append(previous.id)
            continue
        identity = json.dumps(
            [data.source_url, data.collected_at.isoformat(), data.jd_text], ensure_ascii=False
        )
        identifier = "jd_market_" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
        payload = parse_job_data(provider, data).model_dump(mode="json")
        try:
            with session.begin_nested():
                row = JDRow(id=identifier, payload=payload, is_mock=False)
                session.add(row)
                session.flush()
            created += 1
        except IntegrityError:
            # A concurrent import of this fixed snapshot may already own the deterministic ID.
            row = session.get(JDRow, identifier)
            if row is None or row.is_mock or row.payload != payload:
                raise
        identifiers.append(identifier)
    return SampleImportResult(created=created, existing=5 - created, jd_ids=identifiers)
