import ipaddress
import re
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .errors import ConfigurationError

STYLES = {
    "openai_chat": "/chat/completions",
    "openai_responses": "/responses",
    "anthropic_messages": "/messages",
}
PRESETS = {
    "openai": ("openai_responses", "https://api.openai.com/v1", "gpt-4.1"),
    "anthropic": ("anthropic_messages", "https://api.anthropic.com/v1", "claude-sonnet-4-6"),
    "deepseek": ("openai_chat", "https://api.deepseek.com", "deepseek-v4-flash"),
    "qwen": ("openai_chat", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "qwen-plus"),
}
ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"]


def secure_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or any(c.isspace() or ord(c) < 32 for c in value)
            or "\\" in value
            or parsed.port == 0
        ):
            raise ValueError
        host = parsed.hostname.encode("idna").decode("ascii")
        if ":" in host:
            ipaddress.IPv6Address(host)
        elif not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", host):
            raise ValueError
        return value.rstrip("/")
    except ValueError:
        raise ConfigurationError(
            "模型服务地址必须为不含凭据、查询参数或片段的合法 HTTPS URL"
        ) from None


class DiagnosisSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="T5_DIAGNOSIS_",
        env_file=Path(__file__).resolve().parents[3] / ".env",
        extra="ignore",
        populate_by_name=True,
        hide_input_in_errors=True,
    )
    llm_vendor: Literal["openai", "anthropic", "deepseek", "qwen", "custom"] = "deepseek"
    api_style: Literal["openai_chat", "openai_responses", "anthropic_messages"] | None = None
    api_key: SecretStr = SecretStr("")
    legacy_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="DEEPSEEK_API_KEY", exclude=True, repr=False
    )
    base_url: str | None = None
    model: str | None = None
    endpoint_path: str | None = None
    reasoning_effort: ReasoningEffort | None = None
    # Explicit OpenAI Chat JSON capability; None preserves vendor defaults.
    json_mode: bool | None = None
    # Legacy TIMEOUT_SECONDS now bounds the entire transport attempt, including DNS.
    timeout_seconds: float = Field(default=45, gt=0, le=90, allow_inf_nan=False)
    connect_timeout_seconds: float = Field(default=5, gt=0, le=15, allow_inf_nan=False)
    read_timeout_seconds: float = Field(default=40, gt=0, le=90, allow_inf_nan=False)
    total_timeout_seconds: float = Field(default=95, gt=0, le=120, allow_inf_nan=False)
    max_attempts: int = Field(default=2, ge=1, le=5)
    output_retries: int = Field(default=0, ge=0, le=1)
    backoff_seconds: float = Field(default=1, ge=0, le=5, allow_inf_nan=False)
    retry_after_cap_seconds: float = Field(default=5, ge=0, le=10, allow_inf_nan=False)
    max_tokens: int = Field(default=4096, ge=512, le=8192)
    cache_size: int = Field(default=128, ge=0, le=1024)
    cache_ttl_seconds: float = Field(default=600, ge=0, le=3600, allow_inf_nan=False)

    @property
    def worst_case_seconds(self):
        waits = sum(
            max(min(self.backoff_seconds * 2**i, 5), self.retry_after_cap_seconds)
            for i in range(self.max_attempts - 1)
        )
        return min(self.total_timeout_seconds, self.max_attempts * self.timeout_seconds + waits)

    @model_validator(mode="after")
    def resolve(self):
        if self.llm_vendor == "custom":
            if not self.api_style or not self.base_url or not self.model:
                raise ConfigurationError("custom 必须显式配置 API_STYLE、BASE_URL、MODEL")
        else:
            style, base, model = PRESETS[self.llm_vendor]
            self.api_style = self.api_style or style
            self.base_url = self.base_url or base
            self.model = self.model or model
        self.base_url = secure_url(self.base_url)
        if self.json_mode is not None and self.api_style != "openai_chat":
            raise ConfigurationError("JSON_MODE 仅适用于 openai_chat")
        if self.llm_vendor == "deepseek" and not self.api_key.get_secret_value():
            self.api_key = self.legacy_api_key
        if self.endpoint_path is not None:
            path = self.endpoint_path
            if (
                not path.startswith("/")
                or path.startswith("//")
                or any(x in path for x in ("?", "#", "\\", ":", "%"))
                or any(c.isspace() or ord(c) < 32 for c in path)
                or any(s in (".", "..") for s in path.split("/"))
            ):
                raise ConfigurationError("ENDPOINT_PATH 必须是无查询参数的绝对路径")
        return self

    @property
    def endpoint(self):
        base = secure_url(self.base_url)
        if self.endpoint_path is not None:
            parsed = urlsplit(base)
            return urlunsplit((parsed.scheme, parsed.netloc, self.endpoint_path, "", ""))
        suffix = STYLES[self.api_style]
        return (
            base
            if any(urlsplit(base).path.endswith(path) for path in STYLES.values())
            else base + suffix
        )

    @field_validator("model")
    @classmethod
    def nonempty_model(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.strip():
            raise ValueError("模型名不能为空")
        return value.strip()
