"""D integration on A's isolated real-PostgreSQL fixture, not an in-memory fake."""

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.matching import MatchContext
from backend.core.providers import Provider
from backend.core.vectors import VectorRepository
from backend.main import create_app
from backend.models.entities import MatchRow
from backend.modules.jobs.public import JobsService
from backend.modules.jobs.vector_cache import cached_comparator
from backend.modules.jobs.vector_plan import source_hash, vector_space
from backend.schemas.contracts import JD, Resume
from tests.core.test_vectors import pg_engine as core_pg_engine
from tests.jobs.test_vector_cache import DeterministicEmbedding


@pytest.fixture
def pg_engine():
    yield from core_pg_engine.__wrapped__()


@contextmanager
def api_on(engine, service):
    app = create_app(Settings(_env_file=None, database_url="sqlite://"))
    with TestClient(app) as client:
        initial = app.state.engine
        app.state.engine = engine
        app.state.providers["jobs"] = Provider(service, False)
        try:
            yield client, app
        finally:
            app.state.engine = initial


def seed(client):
    draft = client.post(
        "/api/v1/resumes/preview", json={"raw_text": "技能：Python\n项目经历：使用 Python 清洗数据"}
    )
    assert draft.status_code == 200
    saved = client.post("/api/v1/resumes", json=draft.json())
    job = client.post("/api/v1/jobs", json={"title": "Analyst", "jd_text": "Python;SQL;分析数据"})
    assert saved.status_code == job.status_code == 201
    return Resume(**{k: v for k, v in saved.json().items() if k in Resume.model_fields}), JD(
        **{k: v for k, v in job.json().items() if k in JD.model_fields}
    )


def test_real_api_miss_hit_and_changed_inputs(pg_engine):
    provider = DeterministicEmbedding()
    service = JobsService(embedding=provider)
    with api_on(pg_engine, service) as (client, _):
        resume, jd = seed(client)
        pair = {"resume_id": resume.id, "jd_id": jd.id}
        first = client.post("/api/v1/matches", json=pair)
        assert first.status_code == 201
        count = len(provider.calls)
        second = client.post("/api/v1/matches", json=pair)
        assert second.status_code == 201 and len(provider.calls) == count
        assert first.json()["score"] == second.json()["score"]
        assert "resume:hit, jd:hit" in second.json()["gap_analysis"][-1]
        assert client.get("/api/v1/matches/" + second.json()["id"]).status_code == 200
        for kind in ("resume", "jd"):
            if kind == "resume":
                resume = resume.model_copy(update={"experience": ["使用 Python 训练分类器"]})
            else:
                jd = jd.model_copy(update={"jd_text": "Python;构建模型"})
            before = len(provider.calls)
            with Session(pg_engine) as session, session.begin():
                result = service.match_detail(resume, jd, context=MatchContext(session))
            assert f"{kind}:miss" in result.result.gap_analysis[-1]
            assert f"{'jd' if kind == 'resume' else 'resume'}:hit" in result.result.gap_analysis[-1]
            assert len(provider.calls) == before + 1
            with Session(pg_engine) as session, session.begin():
                result2 = service.match_detail(resume, jd, context=MatchContext(session))
            assert "resume:hit, jd:hit" in result2.result.gap_analysis[-1]
            assert result.semantic_score == result2.semantic_score


@pytest.mark.parametrize(
    "change", [{"preprocessing": "t5-clauses-v3"}, {"revision": "test-new-revision"}]
)
def test_real_version_isolation(pg_engine, change):
    provider = DeterministicEmbedding()
    with api_on(pg_engine, JobsService()) as (client, _):
        resume, jd = seed(client)
    with Session(pg_engine) as session, session.begin():
        repo = VectorRepository(session)
        cached_comparator(repo, resume, jd, [])(provider, ["Python"], ["SQL"])
    count = len(provider.calls)
    spec = vector_space(**change)
    provider.model = spec.model.rsplit("|", 1)[0]
    with Session(pg_engine) as session, session.begin():
        events = []
        cached_comparator(VectorRepository(session), resume, jd, events, space=spec)(
            provider, ["Python"], ["SQL"]
        )
    assert events == ["resume:miss", "jd:miss"] and len(provider.calls) == count + 2
    with Session(pg_engine) as session:
        repo = VectorRepository(session)
        assert repo.get_fragments(
            vector_space(), kind="jd", document_id=jd.id, source_hash=source_hash(["Python"])
        )


@pytest.mark.parametrize("model_available", [True, False])
def test_real_write_failure_rolls_back_savepoint_then_memory_fallback(
    pg_engine, monkeypatch, model_available
):
    provider = DeterministicEmbedding()
    service = JobsService(embedding=provider)
    with api_on(pg_engine, service) as (client, _):
        resume, jd = seed(client)
        original = VectorRepository.replace_fragments
        original_encode = provider.encode

        def unavailable(texts):
            raise RuntimeError("intentional model unavailable")

        def fail(repo, batch):
            original(repo, batch)
            if not model_available:
                provider.encode = unavailable
            # Actual PostgreSQL SQL error after a successful cache write, test injection only.
            repo.session.execute(text("SELECT 1 / 0"))

        monkeypatch.setattr(VectorRepository, "replace_fragments", fail)
        response = client.post("/api/v1/matches", json={"resume_id": resume.id, "jd_id": jd.id})
        assert response.status_code == 201
        assert "缓存不可用" in response.json()["gap_analysis"][-1]
        assert response.json()["score"] == service.match(resume, jd).score
        if not model_available:
            assert response.json()["score"] == service.keyword_match(resume, jd).score
        monkeypatch.setattr(VectorRepository, "replace_fragments", original)
        provider.encode = original_encode
        recovered = client.post("/api/v1/matches", json={"resume_id": resume.id, "jd_id": jd.id})
        assert recovered.status_code == 201
        assert "resume:miss, jd:miss" in recovered.json()["gap_analysis"][-1]


def test_real_workflow_failure_rolls_back_entire_cache(pg_engine):
    class Failure:
        def diagnose(self, data):
            raise RuntimeError("intentional offline diagnosis failure")

    provider = DeterministicEmbedding()
    service = JobsService(embedding=provider)
    with api_on(pg_engine, service) as (client, app):
        resume, jd = seed(client)
        app.state.providers["diagnosis"] = Provider(Failure(), False)
        pair = {"resume_id": resume.id, "jd_id": jd.id}
        failed = client.post("/api/v1/workflow", json=pair)
        assert failed.status_code == 502 and provider.calls
        # There is no public list-matches route; inspect records in the isolated fixture.
        with Session(pg_engine) as session:
            assert session.scalar(select(func.count()).select_from(MatchRow)) == 0
        recovered = client.post("/api/v1/matches", json=pair)
        assert recovered.status_code == 201
        assert "resume:miss, jd:miss" in recovered.json()["gap_analysis"][-1]
