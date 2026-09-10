"""Deletion is atomic, removes dependencies and preserves unrelated career data."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.main import create_app
from backend.models.entities import DiagnosisRow, JDRow, MatchRow, ResumeRow
from backend.models.vectors import FragmentVectorRow, VectorRow, VectorSpaceRow
from tests.core.test_vectors import pg_engine as core_pg_engine


@pytest.fixture
def pg_engine():
    yield from core_pg_engine.__wrapped__()


@pytest.fixture
def app():
    return create_app(Settings(_env_file=None, database_url="sqlite://", resume_provider="mock"))


def populate(engine, count=2):
    with Session(engine) as db, db.begin():
        db.add(JDRow(id="jd_keep", payload={"title": "Fixture", "jd_text": "SQL"}))
        db.add_all(
            ResumeRow(id=f"resume_{index}", payload={"raw_text": f"Fixture {index}"})
            for index in range(count)
        )
        db.flush()
        for index in range(count):
            for model, prefix in ((MatchRow, "match"), (DiagnosisRow, "diagnosis")):
                db.add(
                    model(
                        id=f"{prefix}_{index}",
                        resume_id=f"resume_{index}",
                        jd_id="jd_keep",
                        payload={},
                    )
                )


def counts(engine):
    with Session(engine) as db:
        return [
            db.scalar(select(func.count()).select_from(model))
            for model in (ResumeRow, MatchRow, DiagnosisRow, JDRow)
        ]


def test_delete_one_preserves_other_resume_and_job(app):
    with TestClient(app) as client:
        populate(app.state.engine)
        response = client.delete("/api/v1/resumes/resume_0")
        assert response.status_code == 200
        assert response.json() == {"deleted_count": 1}
        assert counts(app.state.engine) == [1, 1, 1, 1]
        for path in ("resumes/resume_0", "matches/match_0", "diagnoses/diagnosis_0"):
            assert client.get(f"/api/v1/{path}").status_code == 404
        assert client.get("/api/v1/resumes/resume_1").status_code == 200
        assert client.get("/api/v1/jobs/jd_keep").status_code == 200
        assert client.delete("/api/v1/resumes/resume_0").status_code == 404
        assert counts(app.state.engine) == [1, 1, 1, 1]


def test_clear_all_ignores_list_pagination_and_is_safe_when_empty(app):
    with TestClient(app) as client:
        populate(app.state.engine, 105)
        assert len(client.get("/api/v1/resumes").json()) == 20
        response = client.delete("/api/v1/resumes")
        assert response.status_code == 200
        assert response.json() == {"deleted_count": 105}
        assert counts(app.state.engine) == [0, 0, 0, 1]
        assert client.delete("/api/v1/resumes").json() == {"deleted_count": 0}


@pytest.mark.parametrize("path", ["/resumes", "/resumes/resume_0"])
def test_failed_parent_delete_rolls_back_removed_children(app, path):
    def fail_parent_delete(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("DELETE FROM resumes"):
            raise RuntimeError("injected delete failure")

    with TestClient(app) as client:
        populate(app.state.engine)
        event.listen(app.state.engine, "before_cursor_execute", fail_parent_delete)
        try:
            with pytest.raises(RuntimeError, match="injected delete failure"):
                client.delete(f"/api/v1{path}")
        finally:
            event.remove(app.state.engine, "before_cursor_execute", fail_parent_delete)
        assert counts(app.state.engine) == [2, 2, 2, 1]


def test_postgres_deletion_cascades_both_vector_types_and_keeps_job_vectors(app, pg_engine):
    with TestClient(app) as client:
        original = app.state.engine
        app.state.engine = pg_engine
        try:
            populate(pg_engine)
            with Session(pg_engine) as db, db.begin():
                db.add(VectorSpaceRow(id="fixture", model="test", dimensions=3, metric="cosine"))
                db.flush()
                for model in (VectorRow, FragmentVectorRow):
                    for key, identifier in (
                        ("resume_id", "resume_0"),
                        ("resume_id", "resume_1"),
                        ("jd_id", "jd_keep"),
                    ):
                        values = {key: identifier}
                        if model is FragmentVectorRow:
                            values["index"] = 0
                        db.add(
                            model(
                                space_id="fixture",
                                dimensions=3,
                                source_hash="a" * 64,
                                embedding=[1, 0, 0],
                                **values,
                            )
                        )
            assert client.delete("/api/v1/resumes/resume_0").json() == {"deleted_count": 1}
            assert counts(pg_engine) == [1, 1, 1, 1]
            with Session(pg_engine) as db:
                for model in (VectorRow, FragmentVectorRow):
                    rows = db.scalars(select(model)).all()
                    assert {(row.resume_id, row.jd_id) for row in rows} == {
                        ("resume_1", None),
                        (None, "jd_keep"),
                    }
            assert client.delete("/api/v1/resumes").json() == {"deleted_count": 1}
            with Session(pg_engine) as db:
                for model in (VectorRow, FragmentVectorRow):
                    rows = db.scalars(select(model)).all()
                    assert [(row.resume_id, row.jd_id) for row in rows] == [(None, "jd_keep")]
        finally:
            app.state.engine = original
