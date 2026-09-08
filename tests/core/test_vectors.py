"""Real PostgreSQL-only integration checks; skipped only when no test URL is supplied."""

import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.core.database import build_engine
from backend.core.migrations import migrate, versions
from backend.core.vectors import VectorRepository, VectorSpace, VectorWrite
from backend.models.entities import JDRow, ResumeRow
from backend.models.vectors import VectorRow


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
        assert sorted(session.scalars(select(versions.c.version))) == [1, 2, 3]
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
