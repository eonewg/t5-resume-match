"""Transactional, additive migrations for existing SQLite and PostgreSQL stores."""

from sqlalchemy import Column, Integer, MetaData, Table, insert, select, text, update

from backend.models.entities import Base, JDRow
from backend.schemas.contracts import JDFields, JDSource

versions = Table("schema_migrations", MetaData(), Column("version", Integer, primary_key=True))


def migrate(engine):
    with engine.begin() as connection:
        postgres = connection.dialect.name == "postgresql"
        if postgres:
            connection.execute(text("SELECT pg_advisory_xact_lock(5450001)"))
        versions.create(connection, checkfirst=True)
        applied = set(connection.scalars(select(versions.c.version)))
        # Exclude PostgreSQL-only tables even when another caller already imported them.
        core_tables = [
            t
            for t in Base.metadata.sorted_tables
            if t.name not in {"vector_spaces", "document_vectors", "fragment_vectors"}
        ]
        Base.metadata.create_all(connection, tables=core_tables)
        if 1 not in applied:
            connection.execute(insert(versions).values(version=1))
        if 2 not in applied:
            defaults = JDFields().model_dump()
            for row in connection.execute(select(JDRow.id, JDRow.payload)).mappings():
                payload = {**defaults, **row["payload"]}
                connection.execute(
                    update(JDRow).where(JDRow.id == row["id"]).values(payload=payload)
                )
            connection.execute(insert(versions).values(version=2))
        if postgres and 3 not in applied:
            from backend.models.vectors import VectorRow, VectorSpaceRow

            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            Base.metadata.create_all(
                connection, tables=[VectorSpaceRow.__table__, VectorRow.__table__]
            )
            connection.execute(insert(versions).values(version=3))

        if postgres and 4 not in applied:
            from backend.models.vectors import FragmentVectorRow

            FragmentVectorRow.__table__.create(connection, checkfirst=True)
            connection.execute(insert(versions).values(version=4))

        if 5 not in applied:
            defaults = JDSource().model_dump(mode="json")
            for row in connection.execute(select(JDRow.id, JDRow.payload)).mappings():
                connection.execute(
                    update(JDRow)
                    .where(JDRow.id == row["id"])
                    .values(payload={**defaults, **row["payload"]})
                )
            connection.execute(insert(versions).values(version=5))
