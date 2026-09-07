from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    is_mock: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ResumeRow(Record, Base):
    __tablename__ = "resumes"


class JDRow(Record, Base):
    __tablename__ = "jobs"


class PairRecord(Record):
    resume_id: Mapped[str] = mapped_column(ForeignKey("resumes.id"), index=True)
    jd_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)


class MatchRow(PairRecord, Base):
    __tablename__ = "matches"


class DiagnosisRow(PairRecord, Base):
    __tablename__ = "diagnoses"
