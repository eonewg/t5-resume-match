"""A-owned boundary validation and orchestration. Never import module internals."""

import logging
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.matching import MatchContext
from backend.models.entities import DiagnosisRow, JDRow, MatchRow, ResumeRow
from backend.schemas.contracts import (
    JD,
    DiagnosisInput,
    DiagnosisResult,
    MatchResult,
    PairInput,
    Resume,
)

logger = logging.getLogger(__name__)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def invoke(provider, method: str, schema: type[BaseModel], *args):
    try:
        result = getattr(provider.service, method)(*args)
        # Revalidate even model instances: implementations may construct invalid models.
        if isinstance(result, BaseModel):
            result = result.model_dump()
        return schema.model_validate(result)
    except Exception as error:
        # Do not put resume text, provider URLs or credentials in error responses/logs.
        logger.error("Provider %s failed (%s)", method, type(error).__name__)
        raise HTTPException(502, "模块执行失败或返回值不符合公共契约") from error


def require_row(session: Session, table, identifier: str):
    row = session.get(table, identifier)
    if row is None:
        raise HTTPException(404, "记录不存在")
    return row


def load_pair(session: Session, pair: PairInput):
    resume_row = require_row(session, ResumeRow, pair.resume_id)
    jd_row = require_row(session, JDRow, pair.jd_id)
    return (
        Resume(id=resume_row.id, **resume_row.payload),
        JD(id=jd_row.id, **jd_row.payload),
        resume_row.is_mock or jd_row.is_mock,
    )


def matching(session, providers, pair):
    resume, jd, input_mock = load_pair(session, pair)
    provider = providers["jobs"]
    if callable(getattr(provider.service, "match_with_context", None)):
        result = invoke(
            provider, "match_with_context", MatchResult, resume, jd, MatchContext(session)
        )
    else:
        result = invoke(provider, "match", MatchResult, resume, jd)
    if result.resume_id != pair.resume_id or result.jd_id != pair.jd_id:
        raise HTTPException(502, "匹配模块返回了错误的关联 ID")
    row = MatchRow(
        id=new_id("match"),
        **pair.model_dump(),
        payload=result.model_dump(),
        is_mock=provider.is_mock or input_mock,
    )
    session.add(row)
    return row


def diagnosing(session, providers, pair):
    resume, jd, input_mock = load_pair(session, pair)
    provider = providers["diagnosis"]
    data = DiagnosisInput(resume_text=resume.raw_text, jd_text=jd.jd_text)
    result = invoke(provider, "diagnose", DiagnosisResult, data)
    row = DiagnosisRow(
        id=new_id("diagnosis"),
        **pair.model_dump(),
        payload=result.model_dump(),
        is_mock=provider.is_mock or input_mock,
    )
    session.add(row)
    return row


def match_response(row):
    return dict(id=row.id, is_mock=row.is_mock, **row.payload)


def diagnosis_response(row):
    return dict(
        id=row.id,
        is_mock=row.is_mock,
        resume_id=row.resume_id,
        jd_id=row.jd_id,
        **row.payload,
    )
