from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DiagnosisSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="T5_DIAGNOSIS_",
        env_file=Path(__file__).resolve().parents[3] / ".env",
        extra="ignore",
    )
    api_key: SecretStr = Field(default=SecretStr(""), validation_alias="DEEPSEEK_API_KEY")
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-flash"
    timeout_seconds: float = Field(default=30, gt=0, le=120, allow_inf_nan=False)
    max_attempts: int = Field(default=3, ge=1, le=5)
    max_tokens: int = Field(default=4096, ge=512, le=8192)
    cache_size: int = Field(default=128, ge=0, le=1024)
    cache_ttl_seconds: float = Field(default=600, ge=0, le=3600, allow_inf_nan=False)

    @field_validator("base_url")
    @classmethod
    def secure_url(cls, value: str) -> str:
        from urllib.parse import urlsplit

        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("模型服务地址必须为不含凭据的 HTTPS URL")
        return value.rstrip("/")

    @field_validator("model")
    @classmethod
    def nonempty_model(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("模型名不能为空")
        return value.strip()
