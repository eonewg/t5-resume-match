"""PostgreSQL-only tables; dimensions and model identifiers belong to the caller."""

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.entities import Base


class VectorSpaceRow(Base):
    __tablename__ = "vector_spaces"
    __table_args__ = (
        UniqueConstraint("id", "dimensions"),
        CheckConstraint("dimensions BETWEEN 1 AND 16000"),
        CheckConstraint("metric IN ('cosine', 'l2', 'inner_product')"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    model: Mapped[str] = mapped_column(String(200))
    dimensions: Mapped[int] = mapped_column(Integer)
    metric: Mapped[str] = mapped_column(String(20))


class VectorRow(Base):
    __tablename__ = "document_vectors"
    __table_args__ = (
        ForeignKeyConstraint(
            ["space_id", "dimensions"],
            ["vector_spaces.id", "vector_spaces.dimensions"],
            ondelete="CASCADE",
        ),
        CheckConstraint("vector_dims(embedding) = dimensions"),
        CheckConstraint("(resume_id IS NULL) <> (jd_id IS NULL)"),
        UniqueConstraint("space_id", "resume_id"),
        UniqueConstraint("space_id", "jd_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    space_id: Mapped[str] = mapped_column(String(64), index=True)
    dimensions: Mapped[int] = mapped_column(Integer)
    resume_id: Mapped[str | None] = mapped_column(
        ForeignKey("resumes.id", ondelete="CASCADE"), index=True
    )
    jd_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    source_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list[float]] = mapped_column(Vector())


class FragmentVectorRow(Base):
    __tablename__ = "fragment_vectors"
    __table_args__ = (
        ForeignKeyConstraint(
            ["space_id", "dimensions"],
            ["vector_spaces.id", "vector_spaces.dimensions"],
            ondelete="CASCADE",
        ),
        CheckConstraint('"index" >= 0'),
        CheckConstraint("vector_dims(embedding) = dimensions"),
        CheckConstraint("(resume_id IS NULL) <> (jd_id IS NULL)"),
        UniqueConstraint("space_id", "resume_id", "index"),
        UniqueConstraint("space_id", "jd_id", "index"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    space_id: Mapped[str] = mapped_column(String(64), index=True)
    dimensions: Mapped[int] = mapped_column(Integer)
    resume_id: Mapped[str | None] = mapped_column(
        ForeignKey("resumes.id", ondelete="CASCADE"), index=True
    )
    jd_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    source_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list[float]] = mapped_column(Vector())
