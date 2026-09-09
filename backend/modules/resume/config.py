"""Independent Resume extraction settings; no Diagnosis configuration dependency."""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class ResumeSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="T5_RESUME_",
        env_file=Path(__file__).resolve().parents[3] / ".env",
        extra="ignore",
        hide_input_in_errors=True,
    )
    ai_enabled: bool = True
    llm_vendor: str = "custom"
    llm_model: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_base_url: str = ""
    llm_timeout: float = Field(default=30, gt=0, le=120)
    api_style: Literal["chat_completions", "responses"] = "chat_completions"
    structured_output: Literal["json_schema", "json_object"] = "json_schema"

    @property
    def endpoint(self) -> str:
        value = self.llm_base_url.rstrip("/")
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or "\\" in value
            or any(c.isspace() or ord(c) < 32 for c in value)
        ):
            raise ValueError("invalid Resume service configuration")
        suffix = "/responses" if self.api_style == "responses" else "/chat/completions"
        return value if value.endswith(suffix) else value + suffix
