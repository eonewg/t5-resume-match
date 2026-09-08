"""Real PostgreSQL-only integration checks; skipped only when no test URL is supplied."""

import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.core.database import build_engine
from backend.core.migrations import migrate, versions
from backend.core.vectors import FragmentSetWrite, VectorRepository, VectorSpace, VectorWrite
from backend.models.entities import JDRow, ResumeRow
from backend.models.vectors import FragmentVectorRow, VectorRow


@pytest.fixture
def pg_engine():
    url = os.environ.get("T5_TEST_DATABASE_URL")
    if not url:
        pytest.skip("T5_TEST_DATABASE_URL is required for real pgvector validation")
    root = build_engine(url)
    assert root.dialect.name == "postgresql"
    schema = "t5_test_" + uuid4().hex
    with root.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public"))
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(
        url,
        connect_args={"options": f"-csearch_path={schema},public"},
        execution_options={"schema_translate_map": {None: schema}},
    )
    try:
        migrate(engine)
        yield engine
    finally:
        engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


def populate(session, metric="cosine", space_id="test"):
    # Deliberately geometric vectors, not model-generated embeddings or student facts.
    session.add_all(
        [
            ResumeRow(id="resume_test", payload={"raw_text": "test"}),
            JDRow(id="jd_a", payload={"title": "a", "jd_text": "test"}),
            JDRow(id="jd_b", payload={"title": "b", "jd_text": "test"}),
        ]
    )
    session.flush()
    repo = VectorRepository(session)
    spec = VectorSpace(id=space_id, model="geometric-test-v1", dimensions=3, metric=metric)
    repo.register_space(spec)
    assert repo.register_space(spec) == spec
    for identifier, vector in [("jd_a", [1, 0, 0]), ("jd_b", [0, 1, 0])]:
        repo.upsert(
            VectorWrite(
                space_id=space_id,
                kind="jd",
                document_id=identifier,
                source_hash="a" * 64,
                values=vector,
            )
        )
    return repo


def test_sqlite_is_not_a_vector_backend():
    engine = build_engine("sqlite://")
    with Session(engine) as session, pytest.raises(ValueError, match="requires PostgreSQL"):
        VectorRepository(session)
    engine.dispose()


@pytest.mark.parametrize("metric,expected", [("cosine", 0), ("l2", 0), ("inner_product", -1)])
def test_real_distances_upsert_readback_and_hnsw(pg_engine, metric, expected):
    with Session(pg_engine) as session, session.begin():
        repo = populate(session, metric)
        hits = repo.nearest("test", [1, 0, 0], kind="jd")
        assert [h.document_id for h in hits] == ["jd_a", "jd_b"]
        assert hits[0].distance == pytest.approx(expected)
        index = repo.ensure_hnsw_index("test")
        assert repo.ensure_hnsw_index("test") == index
        assert (
            session.scalar(
                text(
                    "SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname=:name"
                ),
                {"name": index},
            )
            == 1
        )
        for approximate in (False, True):
            assert (
                repo.nearest("test", [1, 0, 0], kind="jd", approximate=approximate)[0].document_id
                == "jd_a"
            )
        repo.upsert(
            VectorWrite(
                space_id="test",
                kind="jd",
                document_id="jd_a",
                source_hash="b" * 64,
                values=[-1, 0, 0],
            )
        )
    # New connection/session proves committed persistence and upsert uniqueness.
    with Session(pg_engine) as session:
        repo = VectorRepository(session)
        hits = repo.nearest("test", [1, 0, 0], kind="jd")
        assert hits[0].document_id == "jd_b"
        assert hits[1].source_hash == "b" * 64
        assert session.scalar(select(func.count()).select_from(VectorRow)) == 2


def test_migration_idempotence_and_space_and_kind_isolation(pg_engine):
    migrate(pg_engine)
    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        repo.register_space(
            VectorSpace(id="other", model="different-model", dimensions=2, metric="l2")
        )
        repo.upsert(
            VectorWrite(
                space_id="other", kind="jd", document_id="jd_a", source_hash="c" * 64, values=[1, 0]
            )
        )
        repo.upsert(
            VectorWrite(
                space_id="test",
                kind="resume",
                document_id="resume_test",
                source_hash="d" * 64,
                values=[1, 0, 0],
            )
        )
        assert len(repo.nearest("test", [1, 0, 0], kind="jd")) == 2
        assert len(repo.nearest("other", [1, 0], kind="jd")) == 1
        assert len(repo.nearest("test", [1, 0, 0], kind="resume")) == 1
        assert sorted(session.scalars(select(versions.c.version))) == [1, 2, 3, 4]
        with pytest.raises(ValueError, match="different model"):
            repo.register_space(
                VectorSpace(id="test", model="wrong", dimensions=3, metric="cosine")
            )


@pytest.mark.parametrize(
    "values",
    [[1, 0], [0, 0, 0], [1e-50, 0, 0], [float("nan"), 0, 0], [float("inf"), 0, 0], [1e40, 0, 0]],
)
def test_invalid_vectors_cannot_be_written_or_queried(pg_engine, values):
    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        with pytest.raises(ValueError):
            repo.upsert(
                VectorWrite(
                    space_id="test",
                    kind="jd",
                    document_id="jd_a",
                    source_hash="a" * 64,
                    values=values,
                )
            )
        with pytest.raises(ValueError):
            repo.nearest("test", values, kind="jd")


def test_missing_documents_limits_and_rollback(pg_engine):
    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        with pytest.raises(ValueError, match="unknown source"):
            repo.upsert(
                VectorWrite(
                    space_id="test",
                    kind="jd",
                    document_id="absent",
                    source_hash="a" * 64,
                    values=[1, 0, 0],
                )
            )
        with pytest.raises(ValueError, match="unknown vector"):
            repo.nearest("missing", [1, 0, 0], kind="jd")
        for limit in [0, 101, True]:
            with pytest.raises(ValueError):
                repo.nearest("test", [1, 0, 0], kind="jd", limit=limit)
    with Session(pg_engine) as session:
        VectorRepository(session).upsert(
            VectorWrite(
                space_id="test",
                kind="jd",
                document_id="jd_a",
                source_hash="b" * 64,
                values=[0, 0, 1],
            )
        )
        session.rollback()
        assert (
            VectorRepository(session).nearest("test", [1, 0, 0], kind="jd")[0].source_hash
            == "a" * 64
        )


def test_database_constraints_and_document_cascade(pg_engine):
    with Session(pg_engine) as session, session.begin():
        populate(session)
        for values in [
            dict(space_id="test", dimensions=3, jd_id="jd_a", embedding=[1, 0]),
            dict(space_id="test", dimensions=2, jd_id="jd_a", embedding=[1, 0]),
            dict(space_id="test", dimensions=3, jd_id="missing", embedding=[1, 0, 0]),
            dict(space_id="test", dimensions=3, embedding=[1, 0, 0]),
        ]:
            with pytest.raises(IntegrityError), session.begin_nested():
                session.add(VectorRow(source_hash="a" * 64, **values))
                session.flush()
        session.delete(session.get(JDRow, "jd_a"))
        session.flush()
        assert session.scalar(select(func.count()).select_from(VectorRow)) == 1


SPEC = VectorSpace(id="test", model="geometric-test-v1", dimensions=3, metric="cosine")


def batch(kind="jd", document_id="jd_a", source_hash="a" * 64, fragments=None, space=SPEC):
    return FragmentSetWrite(
        space=space,
        kind=kind,
        document_id=document_id,
        source_hash=source_hash,
        fragments=[[1, 0, 0], [0, 1, 0]] if fragments is None else fragments,
    )


def read(repo, value):
    return repo.get_fragments(
        value.space, kind=value.kind, document_id=value.document_id, source_hash=value.source_hash
    )


@pytest.mark.parametrize("kind,identifier", [("jd", "jd_a"), ("resume", "resume_test")])
def test_fragment_reconnect_replace_delete_and_legacy_isolation(pg_engine, kind, identifier):
    original = batch(kind, identifier)
    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        assert read(repo, original) is None
        written = repo.replace_fragments(original)
        assert [f.index for f in written] == [0, 1]
        assert all(
            f.space_id == "test"
            and f.kind == kind
            and f.document_id == identifier
            and f.source_hash == "a" * 64
            for f in written
        )
    pg_engine.dispose()  # Force new physical connections, not merely new Sessions.
    with Session(pg_engine) as session, session.begin():
        repo = VectorRepository(session)
        assert read(repo, original) == written
        assert [f.values for f in read(repo, original)] == original.fragments
        updated = batch(kind, identifier, "b" * 64, [[0, 0, 1]])
        assert read(repo, updated) is None
        repo.replace_fragments(updated)
        assert read(repo, original) is None
        assert [f.values for f in read(repo, updated)] == [[0, 0, 1]]
        # Fragment writes do not enter the old whole-document nearest namespace.
        assert repo.nearest("test", [1, 0, 0], kind="jd")[0].distance == pytest.approx(0)
        repo.replace_fragments(batch(kind, identifier, fragments=[]))
        assert read(repo, updated) is None
        repo.replace_fragments(original)
        session.delete(session.get(JDRow if kind == "jd" else ResumeRow, identifier))
        session.flush()
        assert read(repo, original) is None
        assert session.scalar(select(func.count()).select_from(FragmentVectorRow)) == 0


@pytest.mark.parametrize("model", ["other-model-v1", "geometric-test-preprocessing-v2"])
def test_fragment_space_identity_and_isolation(pg_engine, model):
    other = VectorSpace(id="other", model=model, dimensions=3, metric="cosine")
    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        repo.register_space(other)
        repo.replace_fragments(batch())
        assert read(repo, batch(space=other)) is None
        repo.replace_fragments(batch(space=other, fragments=[[0, 0, 1]]))
        assert len(read(repo, batch())) == 2
        assert len(read(repo, batch(space=other))) == 1
        bad = SPEC.model_copy(update={"model": model})
        for operation in [
            lambda: read(repo, batch(space=bad)),
            lambda: repo.replace_fragments(batch(space=bad)),
        ]:
            with pytest.raises(ValueError, match="specification mismatch"):
                operation()
        assert len(read(repo, batch())) == 2


@pytest.mark.parametrize(
    "values",
    [[1, 0], [0, 0, 0], [1e-50, 0, 0], [float("nan"), 0, 0], [float("inf"), 0, 0], [1e40, 0, 0]],
)
def test_fragment_invalid_batch_preserves_previous_set(pg_engine, values):
    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        original = repo.replace_fragments(batch())
        with pytest.raises(ValueError):
            repo.replace_fragments(batch(source_hash="b" * 64, fragments=[[0, 0, 1], values]))
        assert read(repo, batch()) == original


def test_fragment_statement_failure_and_outer_rollback(pg_engine):
    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        old = repo.replace_fragments(batch(fragments=[[1, 0, 0]]))
    with Session(pg_engine) as session, session.begin():
        # Real server-side failure after DELETE, not merely input validation failure.
        session.execute(
            text(
                "ALTER TABLE fragment_vectors ADD CONSTRAINT reject_second "
                'CHECK ("index" < 1) NOT VALID'
            )
        )
        repo = VectorRepository(session)
        with pytest.raises(IntegrityError):
            repo.replace_fragments(batch(source_hash="b" * 64))
        assert read(repo, batch()) == old
        assert session.scalar(text("SELECT 1")) == 1
        session.execute(text("ALTER TABLE fragment_vectors DROP CONSTRAINT reject_second"))
    with Session(pg_engine) as session:
        repo = VectorRepository(session)
        repo.replace_fragments(batch(source_hash="b" * 64))
        session.rollback()
        assert read(repo, batch()) == old
        assert read(repo, batch(source_hash="b" * 64)) is None


def test_fragment_rejects_corrupt_sets_and_invalid_identity(pg_engine):
    from sqlalchemy import update

    with Session(pg_engine) as session, session.begin():
        repo = populate(session)
        for fields in [dict(kind="wrong"), dict(source_hash="bad"), dict(document_id="")]:
            with pytest.raises(ValueError):
                repo.get_fragments(
                    SPEC, **{**dict(kind="jd", document_id="jd_a", source_hash="a" * 64), **fields}
                )
        with pytest.raises(ValueError, match="unknown source"):
            repo.replace_fragments(batch(document_id="missing"))
        repo.replace_fragments(batch())
        session.execute(
            update(FragmentVectorRow)
            .where(FragmentVectorRow.index == 1)
            .values(source_hash="b" * 64)
        )
        with pytest.raises(ValueError, match="inconsistent fragment hashes"):
            read(repo, batch())
        repo.replace_fragments(batch())
        session.execute(
            update(FragmentVectorRow).where(FragmentVectorRow.index == 1).values(index=3)
        )
        with pytest.raises(ValueError, match="non-contiguous"):
            read(repo, batch())


def test_concurrent_fragment_replacements_never_mix(pg_engine):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    with Session(pg_engine) as session, session.begin():
        populate(session)
    first_written, second_started = Event(), Event()

    def first():
        with Session(pg_engine) as session, session.begin():
            VectorRepository(session).replace_fragments(batch())
            first_written.set()
            assert second_started.wait(5)

    def second():
        assert first_written.wait(5)
        with Session(pg_engine) as session, session.begin():
            second_started.set()
            VectorRepository(session).replace_fragments(
                batch(source_hash="b" * 64, fragments=[[0, 0, 1]])
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        a, b = executor.submit(first), executor.submit(second)
        a.result(timeout=10)
        b.result(timeout=10)
    with Session(pg_engine) as session:
        repo = VectorRepository(session)
        assert read(repo, batch()) is None
        assert [f.values for f in read(repo, batch(source_hash="b" * 64))] == [[0, 0, 1]]


@pytest.mark.parametrize("fail_after_match", [False, True])
def test_jobs_context_shares_request_transaction(pg_engine, fail_after_match):
    from fastapi.testclient import TestClient

    from backend.core.config import Settings
    from backend.core.providers import Provider
    from backend.main import create_app
    from backend.models.entities import MatchRow
    from backend.schemas.contracts import MatchResult

    with Session(pg_engine) as session, session.begin():
        populate(session)

    class Jobs:
        def match_with_context(self, resume, jd, context):
            assert resume.id == "resume_test" and jd.id == "jd_a"
            with context.vector_repository() as repo:
                assert repo is not None
                repo.register_space(SPEC)
                assert read(repo, batch()) is None
                repo.replace_fragments(batch())
                assert len(read(repo, batch())) == 2
            return MatchResult(
                resume_id=resume.id,
                jd_id=jd.id,
                score=0,
                matched_skills=[],
                missing_skills=[],
                gap_analysis=[],
            )

        def match(self, resume, jd):
            raise AssertionError("legacy hook must not be invoked")

    class Diagnosis:
        def diagnose(self, data):
            raise RuntimeError("intentional workflow failure")

    app = create_app(Settings(_env_file=None, database_url="sqlite://"))
    with TestClient(app) as client:
        initial = app.state.engine
        app.state.engine = pg_engine
        app.state.providers["jobs"] = Provider(Jobs(), False)
        app.state.providers["diagnosis"] = Provider(Diagnosis(), False)
        response = client.post(
            "/api/v1/workflow" if fail_after_match else "/api/v1/matches",
            json={"resume_id": "resume_test", "jd_id": "jd_a"},
        )
        app.state.engine = initial
        assert response.status_code == (502 if fail_after_match else 201)
    with Session(pg_engine) as session:
        fragments = read(VectorRepository(session), batch())
        assert (fragments is None) == fail_after_match
        assert session.scalar(select(func.count()).select_from(MatchRow)) == (
            0 if fail_after_match else 1
        )


def test_cache_failure_scope_does_not_poison_request(pg_engine):
    from sqlalchemy.exc import DBAPIError

    from backend.core.matching import MatchContext

    with Session(pg_engine) as session, session.begin():
        populate(session)
        context = MatchContext(session)
        with pytest.raises(DBAPIError), context.vector_repository() as repo:
            repo.replace_fragments(batch())
            # Exercise an actual PG statement error within the optional cache scope.
            session.execute(text("SELECT 1 / 0"))
        assert session.scalar(text("SELECT 1")) == 1
        assert read(VectorRepository(session), batch()) is None
        session.add(JDRow(id="after_fallback", payload={"title": "x", "jd_text": "x"}))
    with Session(pg_engine) as session:
        assert session.get(JDRow, "after_fallback") is not None


def test_sqlite_context_is_explicitly_unavailable():
    from backend.core.matching import MatchContext

    engine = build_engine("sqlite://")
    with Session(engine) as session, session.begin():
        with MatchContext(session).vector_repository() as repo:
            assert repo is None
    engine.dispose()


def test_upgrade_v3_preserves_single_vectors(pg_engine):
    from sqlalchemy import delete

    with Session(pg_engine) as session, session.begin():
        populate(session)
        before = VectorRepository(session).nearest("test", [1, 0, 0], kind="jd")
    with pg_engine.begin() as connection:
        FragmentVectorRow.__table__.drop(connection)
        connection.execute(delete(versions).where(versions.c.version == 4))
    migrate(pg_engine)
    migrate(pg_engine)
    with Session(pg_engine) as session, session.begin():
        repo = VectorRepository(session)
        assert repo.nearest("test", [1, 0, 0], kind="jd") == before
        repo.replace_fragments(batch())
        assert len(read(repo, batch())) == 2
