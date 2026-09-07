from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="T5_", env_file=ROOT / ".env", extra="ignore")
    database_url: str = "sqlite:///data/t5.db"
    resume_provider: str = "mock"
    jobs_provider: str = "mock"
    diagnosis_provider: str = "mock"
    analytics_provider: str = "mock"
