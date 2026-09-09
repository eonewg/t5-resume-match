"""Real DB smoke with synthetic geometry only; leaves no sample rows behind."""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from backend.core.config import Settings
from backend.core.database import build_engine
from backend.core.migrations import migrate
from backend.core.vectors import VectorRepository, VectorSpace, VectorWrite
from backend.main import create_app
from backend.models.entities import JDRow, MatchRow, ResumeRow


def main():
    settings = Settings()
    engine = build_engine(settings.database_url)
    if engine.dialect.name != "postgresql":
        raise SystemExit("FAIL: T5_DATABASE_URL must use PostgreSQL")
    migrate(engine)
    with Session(engine) as session, session.begin():
        assert session.scalar(text("SELECT extversion FROM pg_extension WHERE extname='vector'"))
        identifier = "jd_smoke_" + uuid4().hex
        space = "smoke_" + uuid4().hex
        session.add(JDRow(id=identifier, payload={"title": "Geometry fixture", "jd_text": "test"}))
        session.flush()
        repository = VectorRepository(session)
        repository.register_space(
            VectorSpace(id=space, model="smoke-geometry-only", dimensions=3, metric="cosine")
        )
        repository.upsert(
            VectorWrite(
                space_id=space,
                kind="jd",
                document_id=identifier,
                source_hash="0" * 64,
                values=[1, 0, 0],
            )
        )
        repository.ensure_hnsw_index(space)
        hit = repository.nearest(space, [1, 0, 0], kind="jd")[0]
        assert hit.document_id == identifier and abs(hit.distance) < 1e-6
        session.rollback()
    # Real API transaction/serialization on PostgreSQL, independent of Diagnosis availability.
    settings.jobs_provider = "backend.modules.jobs.public:JobsService"
    created = {}
    try:
        with TestClient(create_app(settings)) as client:
            assert client.get("/health").status_code == 200
            # Database acceptance uses explicitly confirmed fixture fields; AI has separate tests.
            response = client.post(
                "/api/v1/resumes", json={"raw_text": "技能：Python", "skills": ["Python"]}
            )
            assert response.status_code == 201
            resume = response.json()
            created[ResumeRow] = resume["id"]
            response = client.post(
                "/api/v1/jobs",
                json={
                    "title": "Smoke fixture",
                    "jd_text": "Python SQL",
                    "salary": "undisclosed",
                    "salary_min": None,
                    "currency": None,
                },
            )
            assert response.status_code == 201
            jd = response.json()
            created[JDRow] = jd["id"]
            response = client.post(
                "/api/v1/matches", json={"resume_id": resume["id"], "jd_id": jd["id"]}
            )
            assert response.status_code == 201
            match = response.json()
            created[MatchRow] = match["id"]
            assert match["score"] == 50 and match["is_mock"] is False
            assert match["missing_skills"] == ["SQL"]
            assert client.get("/api/v1/jobs/" + jd["id"]).json()["salary"] == "undisclosed"
    finally:
        with engine.begin() as connection:
            for table in (MatchRow, JDRow, ResumeRow):
                if table in created:
                    connection.execute(delete(table).where(table.id == created[table]))
        engine.dispose()
    print(
        "PASS: PostgreSQL + pgvector extension, migration, index, upsert, query, Resume -> JD -> keyword match"
    )


if __name__ == "__main__":
    main()
