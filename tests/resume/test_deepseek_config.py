"""Official defaults and shared credentials, with no network or local secret access."""

import json
import os

import pytest

from backend.modules.resume.ai import SYSTEM_PROMPT, ResumeAIError, ResumeAIService
from backend.modules.resume.config import ResumeSettings
from backend.schemas.contracts import TextInput


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    for key in list(os.environ):
        if key.startswith("T5_RESUME_") or key == "DEEPSEEK_API_KEY":
            monkeypatch.delenv(key)


def test_official_defaults_and_wire_request(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "shared-fixture")
    settings = ResumeSettings(_env_file=None)
    assert settings.llm_vendor == "deepseek"
    assert settings.llm_base_url == "https://api.deepseek.com"
    assert settings.api_style == "chat_completions"
    assert settings.structured_output == "json_object"
    assert '"name": null' in SYSTEM_PROMPT
    calls = []

    def send(endpoint, payload, headers, timeout):
        calls.append(1)
        assert endpoint == "https://api.deepseek.com/chat/completions"
        assert payload["model"] == "deepseek-v4-flash"
        assert payload["response_format"] == {"type": "json_object"}
        assert payload["thinking"] == {"type": "disabled"}
        assert payload["max_tokens"] == 4096
        assert headers["Authorization"] == "Bearer shared-fixture"
        return json.dumps(
            {"choices": [{"finish_reason": "stop", "message": {"content": "{}"}}]}
        ).encode()

    raw = "  未提供个人信息。\n"
    result = ResumeAIService(settings, send).parse(TextInput(raw_text=raw))
    assert result.raw_text == raw and result.name is None and result.skills == []
    assert len(calls) == 1


@pytest.mark.parametrize("override", [None, "", "module-fixture"])
def test_key_precedence_in_environment_and_dotenv(monkeypatch, tmp_path, override):
    path = tmp_path / ".env"
    content = "DEEPSEEK_API_KEY=shared-fixture\n"
    if override is not None:
        content += f"T5_RESUME_LLM_API_KEY={override}\n"
    path.write_text(content)
    assert ResumeSettings(_env_file=path).llm_api_key.get_secret_value() == (
        override or "shared-fixture"
    )
    monkeypatch.setenv("T5_RESUME_LLM_API_KEY", "process-fixture")
    assert ResumeSettings(_env_file=path).llm_api_key.get_secret_value() == "process-fixture"


def test_missing_key_never_calls_provider():
    def send(*args):
        pytest.fail("Missing key must not call network")

    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(ResumeSettings(_env_file=None), send).parse(TextInput(raw_text="test"))
    assert exc.value.code == "config" and exc.value.status_code == 503


@pytest.mark.parametrize(
    "changes",
    [
        {"llm_vendor": "custom"},
        {"llm_base_url": "https://other.invalid"},
        {"llm_model": "unknown"},
        {"api_style": "responses"},
    ],
)
def test_no_thinking_capability_guessing(changes):
    assert not ResumeSettings(_env_file=None, **changes).supports_thinking_toggle


def test_shared_official_key_is_not_sent_to_legacy_custom(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "shared-fixture")
    settings = ResumeSettings(_env_file=None, llm_vendor="custom")
    assert not settings.llm_api_key.get_secret_value()
