import copy
import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.core.config import Settings
from backend.main import create_app
from backend.modules.jobs.embedding import DIMENSION, LocalMiniLM, chunks, compare
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JD, MatchResult, Resume


class Stub:
    model = "test-double-not-a-real-model"
    dimension = DIMENSION

    def __init__(self, similarity=0.8):
        self.similarity = similarity
        self.inputs = []

    def encode(self, texts):
        self.inputs = texts
        return [[1.0] + [0.0] * 383] + [
            [self.similarity, math.sqrt(1 - self.similarity**2)] + [0.0] * 382
        ] * (len(texts) - 1)


def pair():
    return (
        Resume(id="r", raw_text="PRIVATE RAW TEXT", skills=["SQL"], experience=["整理异常记录"]),
        JD(id="j", title="数据岗位", jd_text="清理错误和重复数据", skills=["SQL", "数据清洗"]),
    )


def test_blend_preserves_contract_gap_and_input():
    resume, jd = pair()
    before = copy.deepcopy((resume.model_dump(), jd.model_dump()))
    stub = Stub()
    service = JobsService(embedding=stub)
    result = service.match_detail(resume, jd)
    assert result.keyword_score == 50 and result.semantic_score == pytest.approx(80)
    assert result.final_score == 56
    assert result.result.matched_skills == ["SQL"]
    assert result.result.missing_skills == ["数据清洗"]
    assert set(result.result.model_dump()) == set(MatchResult.model_fields)
    assert result.status == "semantic" and result.evidence[0].evidence == "整理异常记录"
    assert "PRIVATE RAW TEXT" not in str(stub.inputs)
    assert (resume.model_dump(), jd.model_dump()) == before
    assert any("× 0.2" in note for note in result.result.gap_analysis)


def test_disabled_is_exact_keyword_baseline(monkeypatch):
    monkeypatch.delenv("T5_JOBS_EMBEDDING", raising=False)
    service = JobsService()
    assert service.match(*pair()) == service.keyword_match(*pair())


def test_zero_weight_does_not_call_provider():
    stub = Stub()
    service = JobsService(embedding=stub, semantic_weight=0)
    assert service.match(*pair()) == service.keyword_match(*pair())
    assert stub.inputs == []


def test_provider_exception_falls_back_without_leaking(monkeypatch):
    stub = Stub()

    def fail(texts):
        raise RuntimeError("private-key private-resume")

    monkeypatch.setattr(stub, "encode", fail)
    service = JobsService(embedding=stub)
    detail = service.match_detail(*pair())
    assert detail.status == "unavailable" and detail.final_score == 50
    assert detail.semantic_score is None
    assert "private" not in str(detail)
    assert "降级" in detail.result.gap_analysis[-1]


@pytest.mark.parametrize(
    "vector", [[0.0] * 384, [1.0] * 383, [float("nan")] * 384, [float("inf")] * 384, [True] * 384]
)
def test_invalid_vectors_fallback(vector, monkeypatch):
    stub = Stub()
    monkeypatch.setattr(stub, "encode", lambda texts: [vector] * len(texts))
    detail = JobsService(embedding=stub).match_detail(*pair())
    assert detail.status == "unavailable" and detail.final_score == 50


def test_incompatible_batch_and_dimension(monkeypatch):
    stub = Stub()
    monkeypatch.setattr(stub, "encode", lambda texts: [])
    with pytest.raises(ValueError):
        compare(stub, ["a"], ["b"])
    stub = Stub()
    stub.dimension = 2
    with pytest.raises(ValueError):
        compare(stub, ["a"], ["b"])


def test_empty_resume_skills_and_experience_fallback():
    resume, jd = pair()
    resume.skills = []
    resume.experience = []
    detail = JobsService(embedding=Stub()).match_detail(resume, jd)
    assert detail.status == "empty" and detail.final_score == 0


def test_empty_jd_skills_can_use_context_but_does_not_invent_keyword_hits():
    resume, jd = pair()
    jd.skills = []
    detail = JobsService(embedding=Stub()).match_detail(resume, jd)
    assert detail.keyword_score == 0 and detail.final_score == 16
    assert detail.result.matched_skills == detail.result.missing_skills == []
    assert any("占位" in note for note in detail.result.gap_analysis)


def test_empty_jd_text_rejected_before_provider():
    resume, jd = pair()
    jd.jd_text = " "
    with pytest.raises(ValidationError):
        JobsService(embedding=Stub()).match(resume, jd)


@pytest.mark.parametrize("weight", [-0.1, 0.51, float("nan"), float("inf")])
def test_invalid_weights_rejected(weight):
    with pytest.raises(ValueError):
        JobsService(embedding=Stub(), semantic_weight=weight).match(*pair())


@pytest.mark.parametrize("cosine,expected", [(-1, 0), (0, 0), (0.8, 80), (1, 100)])
def test_cosine_mapping(cosine, expected):
    score, _ = compare(Stub(cosine), ["a"], ["b"])
    assert score == pytest.approx(expected)


def test_semantics_can_reduce_score_not_just_reward():
    detail = JobsService(embedding=Stub(0)).match_detail(*pair())
    assert detail.keyword_score == 50 and detail.final_score == 40


def test_chunk_normalization_and_budget():
    assert chunks(["Ａ  B；Ａ B\n另一句"]) == ["A B", "另一句"]
    assert [len(x) for x in chunks(["a" * 81])] == [80, 1]
    resume, jd = pair()
    resume.experience = [str(i) for i in range(33)]
    assert JobsService(embedding=Stub()).match_detail(resume, jd).status == "semantic"
    resume.experience = [";".join(str(i) for i in range(513))]
    assert JobsService(embedding=Stub()).match_detail(resume, jd).status == "unavailable"


def test_missing_local_runtime_falls_back(monkeypatch):
    def unavailable():
        raise ImportError("optional runtime unavailable")

    monkeypatch.setattr("backend.modules.jobs.embedding.local_model", unavailable)
    assert JobsService(embedding=LocalMiniLM()).match_detail(*pair()).status == "unavailable"


def test_enhanced_public_api_save_readback(monkeypatch):
    monkeypatch.setenv("T5_JOBS_EMBEDDING", "local")
    monkeypatch.setattr("backend.modules.jobs.public.LocalMiniLM", Stub)
    settings = Settings(
        _env_file=None,
        database_url="sqlite://",
        jobs_provider="backend.modules.jobs.public:JobsService",
    )
    with TestClient(create_app(settings)) as client:
        resume = client.post(
            "/api/v1/resumes", json={"raw_text": "整理数据", "skills": ["SQL"]}
        ).json()
        jd = client.post("/api/v1/jobs", json={"title": "数据岗位", "jd_text": "SQL Python"}).json()
        response = client.post(
            "/api/v1/matches", json={"resume_id": resume["id"], "jd_id": jd["id"]}
        )
        assert response.status_code == 201
        record = response.json()
        assert record["score"] == 56 and record["missing_skills"] == ["Python"]
        assert client.get("/api/v1/matches/" + record["id"]).json() == record
        assert "semantic_score" not in record  # No unauthorized public fields.


def test_maximum_keyword_labels_keep_explanations_within_contract():
    resume, jd = pair()
    jd.skills = [f"{i}:" + "x" * 190 for i in range(500)]
    result = JobsService(embedding=Stub()).match(resume, jd)
    assert len(result.missing_skills) == 500
    assert MatchResult.model_validate(result.model_dump()) == result
    assert max(map(len, result.gap_analysis)) < 5000
