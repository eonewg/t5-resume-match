from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.market_samples import import_sample_jobs
from backend.core.services import (
    diagnosing,
    diagnosis_response,
    invoke,
    match_response,
    matching,
    new_id,
    parse_job_data,
    require_row,
)
from backend.models.entities import DiagnosisRow, JDRow, MatchRow, ResumeRow
from backend.modules.resume.upload import (
    UploadError,
    extract_text,
    upload_limit,
    validate_file_type,
)
from backend.schemas.contracts import (
    JD,
    AnalysisResponse,
    AnalysisResult,
    AnalysisScope,
    DiagnosisRecord,
    JDCreate,
    MatchRecord,
    PairInput,
    Resume,
    ResumeData,
    SampleImportResult,
    SourceType,
    TextInput,
    WorkflowResult,
)

router = APIRouter(prefix="/api/v1")


def session_dependency(request: Request):
    with Session(request.app.state.engine) as session, session.begin():
        yield session


DB = Annotated[Session, Depends(session_dependency, scope="function")]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def mark_mock(response: Response, is_mock: bool):
    response.headers["X-T5-Mock"] = str(is_mock).lower()


def parse_resume_data(provider, data):
    result = invoke(provider, "parse", ResumeData, data)
    if result.raw_text != data.raw_text:
        raise HTTPException(502, "简历解析未保留原文")
    return result


@router.get("/modules", tags=["core"])
def modules(request: Request):
    return {name: {"is_mock": item.is_mock} for name, item in request.app.state.providers.items()}


@router.post("/resumes/parse", response_model=Resume, status_code=201, tags=["resume"])
def parse_resume(data: TextInput, request: Request, response: Response, db: DB):
    provider = request.app.state.providers["resume"]
    result = parse_resume_data(provider, data)
    row = ResumeRow(id=new_id("resume"), payload=result.model_dump(), is_mock=provider.is_mock)
    db.add(row)
    db.flush()
    mark_mock(response, row.is_mock)
    return Resume(id=row.id, **row.payload)


@router.post("/resumes/preview", response_model=ResumeData, tags=["resume"])
def preview_resume(data: TextInput, request: Request, response: Response):
    """Parse an editable draft without creating a persisted resume."""
    provider = request.app.state.providers["resume"]
    result = parse_resume_data(provider, data)
    mark_mock(response, provider.is_mock)
    return result


@router.post("/resumes/upload-preview", response_model=ResumeData, tags=["resume"])
def preview_resume_upload(file: UploadFile, request: Request, response: Response):
    """Extract text into the same editable preview; never write a resume or original file."""
    try:
        suffix = validate_file_type(file.filename, file.content_type)
        limit = upload_limit()
        if file.size is not None and file.size > limit:
            raise UploadError("文件过大，请缩小文件后重试，或直接粘贴简历文本。", 413)
        data = file.file.read(limit + 1)
        if len(data) > limit:
            raise UploadError("文件过大，请缩小文件后重试，或直接粘贴简历文本。", 413)
        text = extract_text(data, suffix)
    except UploadError as exc:
        raise HTTPException(exc.status_code, str(exc)) from None
    finally:
        file.file.close()
    return preview_resume(TextInput(raw_text=text), request, response)


@router.post("/resumes", response_model=Resume, status_code=201, tags=["resume"])
def create_resume(data: ResumeData, response: Response, db: DB):
    row = ResumeRow(id=new_id("resume"), payload=data.model_dump(), is_mock=False)
    db.add(row)
    db.flush()
    mark_mock(response, False)
    return Resume(id=row.id, **row.payload)


@router.get("/resumes", response_model=list[Resume], tags=["resume"])
def list_resumes(
    response: Response,
    db: DB,
    limit: Limit = 20,
    offset: Offset = 0,
    order: Literal["asc", "desc"] = "asc",
):
    ordering = (ResumeRow.created_at, ResumeRow.id)
    if order == "desc":
        ordering = tuple(column.desc() for column in ordering)
    rows = db.scalars(select(ResumeRow).order_by(*ordering).offset(offset).limit(limit)).all()
    mark_mock(response, any(row.is_mock for row in rows))
    return [Resume(id=row.id, **row.payload) for row in rows]


@router.get("/resumes/{identifier}", response_model=Resume, tags=["resume"])
def get_resume(identifier: str, response: Response, db: DB):
    row = require_row(db, ResumeRow, identifier)
    mark_mock(response, row.is_mock)
    return Resume(id=row.id, **row.payload)


@router.post("/jobs", response_model=JD, status_code=201, tags=["jobs"])
def create_job(data: JDCreate, request: Request, response: Response, db: DB):
    provider = request.app.state.providers["jobs"]
    result = parse_job_data(provider, data)
    row = JDRow(id=new_id("jd"), payload=result.model_dump(mode="json"), is_mock=provider.is_mock)
    db.add(row)
    db.flush()
    mark_mock(response, row.is_mock)
    return JD(id=row.id, **row.payload)


@router.get("/jobs", response_model=list[JD], tags=["jobs"])
def list_jobs(response: Response, db: DB, limit: Limit = 20, offset: Offset = 0):
    rows = db.scalars(
        select(JDRow).order_by(JDRow.created_at, JDRow.id).offset(offset).limit(limit)
    ).all()
    mark_mock(response, any(row.is_mock for row in rows))
    return [JD(id=row.id, **row.payload) for row in rows]


@router.get("/jobs/{identifier}", response_model=JD, tags=["jobs"])
def get_job(identifier: str, response: Response, db: DB):
    row = require_row(db, JDRow, identifier)
    mark_mock(response, row.is_mock)
    return JD(id=row.id, **row.payload)


@router.post("/matches", response_model=MatchRecord, status_code=201, tags=["jobs"])
def create_match(data: PairInput, request: Request, db: DB):
    return match_response(matching(db, request.app.state.providers, data))


@router.get("/matches/{identifier}", response_model=MatchRecord, tags=["jobs"])
def get_match(identifier: str, db: DB):
    return match_response(require_row(db, MatchRow, identifier))


@router.post("/diagnoses", response_model=DiagnosisRecord, status_code=201, tags=["diagnosis"])
def create_diagnosis(data: PairInput, request: Request, db: DB):
    return diagnosis_response(diagnosing(db, request.app.state.providers, data))


@router.get("/diagnoses/{identifier}", response_model=DiagnosisRecord, tags=["diagnosis"])
def get_diagnosis(identifier: str, db: DB):
    return diagnosis_response(require_row(db, DiagnosisRow, identifier))


@router.post("/workflow", response_model=WorkflowResult, status_code=201, tags=["core"])
def workflow(data: PairInput, request: Request, db: DB):
    # One transaction: if diagnosis fails the pending match is rolled back.
    match = matching(db, request.app.state.providers, data)
    diagnosis = diagnosing(db, request.app.state.providers, data)
    return WorkflowResult(match=match_response(match), diagnosis=diagnosis_response(diagnosis))


@router.get("/analytics", response_model=AnalysisResponse, tags=["analytics"])
def analytics(
    request: Request,
    db: DB,
    source_type: SourceType | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "采集日期起点不能晚于终点。")
    rows = db.scalars(select(JDRow).order_by(JDRow.created_at, JDRow.id)).all()
    selected, mocks, excluded_mocks = [], 0, 0
    for row in rows:
        job = JD(id=row.id, **row.payload)
        if source_type is not None and job.source_type != source_type:
            continue
        if date_from and (job.collected_at is None or job.collected_at < date_from):
            continue
        if date_to and (job.collected_at is None or job.collected_at > date_to):
            continue
        if source_type == "real" and row.is_mock:
            excluded_mocks += 1
            continue
        selected.append(job)
        mocks += row.is_mock
    provider = request.app.state.providers["analytics"]
    result = invoke(provider, "analyze", AnalysisResult, selected)
    return AnalysisResponse(
        **result.model_dump(),
        is_mock=provider.is_mock or mocks > 0,
        scope=AnalysisScope(
            source_type=source_type,
            date_from=date_from,
            date_to=date_to,
            available_count=len(rows),
            selected_count=len(selected),
            mock_count=mocks,
            excluded_mock_count=excluded_mocks,
        ),
    )


@router.post("/analytics/sample-jobs", response_model=SampleImportResult, tags=["analytics"])
def import_market_jobs(request: Request, db: DB):
    return import_sample_jobs(db, request.app.state.providers["jobs"])
