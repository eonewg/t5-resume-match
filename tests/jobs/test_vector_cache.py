"""Offline contract doubles; real PostgreSQL checks live in test_cache_postgres."""

import hashlib
from contextlib import contextmanager

import pytest

from backend.core.vectors import FragmentVector
from backend.modules.jobs.embedding import LocalMiniLM, compare, score_vectors
from backend.modules.jobs.public import JobsService
from backend.modules.jobs.vector_cache import cached_comparator
from backend.modules.jobs.vector_plan import vector_space
from backend.schemas.contracts import JD, Resume


class DeterministicEmbedding:
    """Explicit test double, never used outside isolated test data."""

    model = LocalMiniLM.model
    dimension = 384

    def __init__(self):
        self.calls = []

    def encode(self, texts):
        self.calls.append(list(texts))
        return [
            [float(value + 1) for value in hashlib.sha256(text.encode()).digest()] * 12
            for text in texts
        ]


class MemoryRepository:
    def __init__(self):
        self.spaces = {}
        self.rows = {}

    def register_space(self, space):
        assert self.spaces.setdefault(space.id, space) == space
        return space

    def get_fragments(self, space, *, kind, document_id, source_hash):
        return self.rows.get((space.id, kind, document_id, source_hash))

    def replace_fragments(self, batch):
        result = [
            FragmentVector(
                space_id=batch.space.id,
                kind=batch.kind,
                document_id=batch.document_id,
                source_hash=batch.source_hash,
                index=index,
                values=values,
            )
            for index, values in enumerate(batch.fragments)
        ]
        self.rows[batch.space.id, batch.kind, batch.document_id, batch.source_hash] = result
        return result


class Context:
    def __init__(self, repo):
        self.repo = repo
        self.exited = False

    @contextmanager
    def vector_repository(self):
        try:
            yield self.repo
        finally:
            self.exited = True


def pair():
    return Resume(id="resume", raw_text="SQL", skills=["SQL"], experience=["分析业务数据"]), JD(
        id="jd", title="Analyst", jd_text="SQL;分析报表", skills=["SQL", "Python"]
    )


def test_cache_hit_avoids_encoding_and_preserves_scores():
    provider = DeterministicEmbedding()
    service = JobsService(embedding=provider)
    resume, jd = pair()
    original = service.match_detail(resume, jd)
    context = Context(MemoryRepository())
    first = service.match_detail(resume, jd, context=context)
    calls = len(provider.calls)
    second = service.match_detail(resume, jd, context=context)
    assert len(provider.calls) == calls
    assert first.semantic_score == pytest.approx(original.semantic_score)
    assert second.semantic_score == first.semantic_score
    assert first.result.matched_skills == original.result.matched_skills
    assert first.result.missing_skills == original.result.missing_skills
    assert "resume:miss, jd:miss" in first.result.gap_analysis[-1]
    assert "resume:hit, jd:hit" in second.result.gap_analysis[-1]
    assert set(first.result.model_dump()) == set(original.result.model_dump())


def test_sqlite_none_and_cache_error_fallback_after_scope_exit():
    provider = DeterministicEmbedding()
    service = JobsService(embedding=provider)
    resume, jd = pair()
    assert service.match_with_context(resume, jd, Context(None)) == service.match(resume, jd)
    context = Context(MemoryRepository())

    def broken(*args, **kwargs):
        raise RuntimeError("private cache failure")

    context.repo.get_fragments = broken
    original = provider.encode

    def encode(texts):
        assert context.exited
        return original(texts)

    provider.encode = encode
    result = service.match_detail(resume, jd, context=context)
    assert result.status == "semantic"
    assert "private cache failure" not in str(result)
    provider.encode = broken
    assert service.match_detail(resume, jd, context=context).status == "unavailable"


def test_disabled_embedding_never_opens_vector_context():
    class Forbidden:
        def vector_repository(self):
            raise AssertionError("disabled mode must not access vectors")

    service = JobsService()
    assert service.match_with_context(*pair(), Forbidden()) == service.keyword_match(*pair())


@pytest.mark.parametrize(
    "change",
    [
        {"preprocessing": "t5-clauses-v3"},
        {"revision": "new-revision"},
        {"model_name": "other-model"},
    ],
)
def test_new_space_cannot_reuse_old_vectors(change):
    repo, provider = MemoryRepository(), DeterministicEmbedding()
    resume, jd = pair()
    cached_comparator(repo, resume, jd, [])(provider, ["SQL"], ["Python"])
    calls = len(provider.calls)
    spec = vector_space(**change)
    provider.model = spec.model.rsplit("|", 1)[0]
    events = []
    cached_comparator(repo, resume, jd, events, space=spec)(provider, ["SQL"], ["Python"])
    assert len(provider.calls) == calls + 2 and events == ["resume:miss", "jd:miss"]


def test_batches_cover_every_fragment_and_match_reference_formula():
    provider = DeterministicEmbedding()
    requirements = [f"requirement {i}" for i in range(80)]
    evidence = [f"experience {i}" for i in range(40)]
    score, pairs = compare(provider, requirements, evidence)
    assert sum(provider.calls, []) == requirements + evidence
    assert max(map(len, provider.calls)) == 16
    direct = DeterministicEmbedding().encode(requirements + evidence)
    expected, expected_pairs = score_vectors(requirements, evidence, direct)
    assert score == pytest.approx(expected) and len(pairs) == len(expected_pairs) == 80
    assert [p.evidence for p in pairs] == [p.evidence for p in expected_pairs]


def test_local_token_limit_prevents_truncated_encoding(monkeypatch):
    class TooManyTokens:
        def tokenizer(self, texts, truncation):
            assert truncation is False
            return {"input_ids": [[1] * 129 for _ in texts]}

        def encode(self, *args, **kwargs):
            raise AssertionError("over-budget text must not be encoded")

    monkeypatch.setattr("backend.modules.jobs.embedding.local_model", TooManyTokens)
    result = JobsService(embedding=LocalMiniLM()).match_detail(*pair())
    assert result.status == "unavailable"
    assert "128 token" in result.result.gap_analysis[-1]


@pytest.mark.parametrize(
    "corruption", ["dimension", "hash", "index", "space", "count", "nan", "zero"]
)
def test_corrupt_cache_is_never_scored(corruption):
    repo, provider = MemoryRepository(), DeterministicEmbedding()
    resume, jd = pair()
    context = Context(repo)
    service = JobsService(embedding=provider)
    service.match_with_context(resume, jd, context)
    rows = next(iter(repo.rows.values()))
    if corruption == "count":
        rows.pop()
    elif corruption in ("nan", "zero", "dimension"):
        rows[0].values = (
            [float("nan")] * 384
            if corruption == "nan"
            else [0.0] * (384 if corruption == "zero" else 3)
        )
    else:
        setattr(
            rows[0],
            {"hash": "source_hash", "index": "index", "space": "space_id"}[corruption],
            5 if corruption == "index" else "bad",
        )
    result = service.match_detail(resume, jd, context=context)
    assert "缓存不可用" in result.result.gap_analysis[-1]
    assert result.semantic_score == pytest.approx(service.match_detail(resume, jd).semantic_score)
