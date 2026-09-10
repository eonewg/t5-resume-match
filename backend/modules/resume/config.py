"""Independent Resume extraction settings; no Diagnosis configuration dependency."""

from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.core.paths import ENV_FILE


class ResumeSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="T5_RESUME_",
        env_file=ENV_FILE,
        extra="ignore",
        populate_by_name=True,
        hide_input_in_errors=True,
    )
    ai_enabled: bool = True
    llm_vendor: str = "deepseek"
    llm_model: str = "deepseek-flash"
    llm_api_key: SecretStr = SecretStr("")
    shared_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="DEEPSEEK_API_KEY", exclude=True, repr=False
    )
    llm_base_url: str = "https://api.deepseek.com"
    llm_timeout: float = Field(default=30, gt=0, le=120)
    api_style: Literal["chat_completions", "responses"] = "chat_completions"
    structured_output: Literal["json_schema", "json_object"] = "json_object"

    @model_validator(mode="after")
    def resolve_key(self):
        if self.llm_vendor == "deepseek" and not self.llm_api_key.get_secret_value():
            self.llm_api_key = self.shared_api_key
        return self

    @property
    def supports_thinking_toggle(self) -> bool:
        """Known Chat capabilities; legacy custom Ling remains explicit opt-in."""
        if self.api_style != "chat_completions":
            return False
        return (
            self.llm_vendor == "deepseek"
            and urlsplit(self.endpoint).hostname == "api.deepseek.com"
            and self.llm_model in {"deepseek-flash", "deepseek-v4-flash", "deepseek-v4-pro"}
        ) or (self.llm_vendor == "custom" and self.llm_model.casefold() == "ling-3.0-flash")

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
