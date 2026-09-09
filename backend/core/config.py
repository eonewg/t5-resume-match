from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="T5_", env_file=ROOT / ".env", extra="ignore")
    database_url: str = "sqlite:///data/t5.db"
    resume_provider: str = "backend.modules.resume.public:ResumeService"
    jobs_provider: str = "backend.modules.jobs.public:JobsService"
    diagnosis_provider: str = "backend.modules.diagnosis.public:DiagnosisService"
    analytics_provider: str = "backend.modules.analytics.public:AnalyticsService"
