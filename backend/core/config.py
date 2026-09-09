from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.core.paths import ENV_FILE, RESOURCE_ROOT

ROOT = RESOURCE_ROOT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="T5_", env_file=ENV_FILE, extra="ignore")
    database_url: str = "sqlite:///data/t5.db"
    resume_provider: str = "backend.modules.resume.public:ResumeService"
    jobs_provider: str = "backend.modules.jobs.public:JobsService"
    diagnosis_provider: str = "backend.modules.diagnosis.public:DiagnosisService"
    analytics_provider: str = "backend.modules.analytics.public:AnalyticsService"
