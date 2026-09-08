import io
import json
from urllib.error import HTTPError, URLError

import pytest

from backend.modules.diagnosis.client import (
    AnthropicMessagesClient,
    NoRedirect,
    OpenAIChatClient,
    OpenAIResponsesClient,
    create_client,
)
from backend.modules.diagnosis.config import DiagnosisSettings
from backend.modules.diagnosis.errors import (
    ConfigurationError,
    InvalidOutputError,
    PermanentLLMError,
    TemporaryLLMError,
)
from backend.modules.diagnosis.mock import MockLLM
from backend.modules.diagnosis.prompts import build_messages
from backend.modules.diagnosis.public import DiagnosisService
from backend.schemas.contracts import DiagnosisInput

TEXT = '{"final":"JSON"}'
MESSAGES = [{"role": "system", "content": "Only JSON"}, {"role": "user", "content": "resume"}]
STYLES = ["openai_chat", "openai_responses", "anthropic_messages"]


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    import os

    for key in list(os.environ):
        if key.startswith("T5_DIAGNOSIS_") or key == "DEEPSEEK_API_KEY":
            monkeypatch.delenv(key)
    monkeypatch.setattr(
        "urllib.request.OpenerDirector.open",
        lambda *a, **kw: pytest.fail("Unexpected network call"),
    )


def config(**kwargs):
    return DiagnosisSettings(_env_file=None, **{"api_key": "fixture-key", **kwargs})


def response(style, content=TEXT):
    if style == "openai_chat":
        return {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": content, "reasoning_content": "PRIVATE THINKING"},
                }
            ]
        }
    if style == "openai_responses":
        return {
            "status": "completed",
            "output": [
                {"type": "reasoning", "summary": [{"text": "PRIVATE THINKING"}]},
                {
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{"type": "output_text", "text": content}],
                },
            ],
        }
    return {
        "type": "message",
        "role": "assistant",
        "stop_reason": "end_turn",
        "content": [
            {"type": "thinking", "thinking": "PRIVATE THINKING"},
            {"type": "text", "text": content},
        ],
    }


class FixtureTransport:
    def __init__(self, value):
        self.value = value
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if isinstance(self.value, Exception):
            raise self.value
        return io.BytesIO(
            self.value if isinstance(self.value, bytes) else json.dumps(self.value).encode()
        )


@pytest.mark.parametrize(
    "vendor,style,adapter,endpoint",
    [
        ("deepseek", "openai_chat", OpenAIChatClient, "https://api.deepseek.com/chat/completions"),
        (
            "openai",
            "openai_responses",
            OpenAIResponsesClient,
            "https://api.openai.com/v1/responses",
        ),
        (
            "anthropic",
            "anthropic_messages",
            AnthropicMessagesClient,
            "https://api.anthropic.com/v1/messages",
        ),
        (
            "qwen",
            "openai_chat",
            OpenAIChatClient,
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        ),
    ],
)
def test_presets_and_wire_request(vendor, style, adapter, endpoint):
    settings = config(llm_vendor=vendor)
    opener = FixtureTransport(response(style))
    client = create_client(settings, opener=opener)
    assert isinstance(client, adapter) and client.complete(MESSAGES) == TEXT
    request, timeout = opener.requests[0]
    assert request.full_url == endpoint and timeout == 30
    body = json.loads(request.data)
    assert body["model"] == settings.model and body["stream"] is False
    if style == "anthropic_messages":
        assert body["system"] == "Only JSON" and body["messages"] == MESSAGES[1:]
        assert request.get_header("X-api-key") == "fixture-key"
        assert request.get_header("Anthropic-version") == "2023-06-01"
        assert request.get_header("Authorization") is None
    elif style == "openai_responses":
        assert body["input"] == MESSAGES and body["max_output_tokens"] == 4096
        assert body["store"] is False
    else:
        assert body["messages"] == MESSAGES


@pytest.mark.parametrize("style", STYLES)
@pytest.mark.parametrize("prefix", ["https://example.test", "https://example.test/gateway/v7"])
def test_custom_deterministic_url_no_v1_inference(style, prefix):
    settings = config(llm_vendor="custom", api_style=style, base_url=prefix, model="custom-model")
    suffix = {
        "openai_chat": "/chat/completions",
        "openai_responses": "/responses",
        "anthropic_messages": "/messages",
    }[style]
    assert settings.endpoint == prefix + suffix
    full = config(
        llm_vendor="custom", api_style=style, base_url=prefix + suffix + "/", model="custom-model"
    )
    assert full.endpoint == prefix + suffix
    override = config(
        llm_vendor="custom",
        api_style=style,
        base_url=prefix + suffix,
        model="custom-model",
        endpoint_path="/proxy/generate",
    )
    assert override.endpoint == "https://example.test/proxy/generate"
    opener = FixtureTransport(response(style))
    assert create_client(settings, opener=opener).complete(MESSAGES) == TEXT
    body = json.loads(opener.requests[0][0].data)
    assert (
        not {
            "thinking",
            "enable_thinking",
            "reasoning_effort",
            "reasoning",
            "output_config",
            "response_format",
            "text",
        }
        & body.keys()
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://example.test",
        "https://",
        "https://user:password@example.test",
        "https://example.test/?key=secret",
        "https://example.test/#secret",
        "https://example.test:99999",
        "https://example.test:bad",
        "https://exa mple.test",
        "https://example.test\\evil",
        "https://example.test\n",
    ],
)
def test_reject_invalid_urls(url):
    with pytest.raises(ConfigurationError):
        config(base_url=url)


@pytest.mark.parametrize(
    "path",
    [
        "responses",
        "//evil.test/messages",
        "/../messages",
        "/x?key=secret",
        "/%2e%2e/messages",
        "/#fragment",
    ],
)
def test_reject_endpoint_overrides(path):
    with pytest.raises(ConfigurationError):
        config(endpoint_path=path)


@pytest.mark.parametrize(
    "vendor,style,model,effort,expected",
    [
        ("openai", "openai_chat", "gpt-5.2", "xhigh", {"reasoning_effort": "xhigh"}),
        ("openai", "openai_responses", "gpt-5.2", "low", {"reasoning": {"effort": "low"}}),
        ("openai", "openai_chat", "gpt-5", "minimal", {"reasoning_effort": "minimal"}),
        (
            "anthropic",
            "anthropic_messages",
            "claude-sonnet-4-6",
            "high",
            {"thinking": {"type": "adaptive"}, "output_config": {"effort": "high"}},
        ),
        (
            "anthropic",
            "anthropic_messages",
            "claude-opus-4-6",
            "max",
            {"thinking": {"type": "adaptive"}, "output_config": {"effort": "max"}},
        ),
        (
            "anthropic",
            "anthropic_messages",
            "claude-sonnet-4-6",
            "none",
            {"thinking": {"type": "disabled"}},
        ),
        (
            "deepseek",
            "openai_chat",
            "deepseek-v4-flash",
            "max",
            {"thinking": {"type": "enabled"}, "reasoning_effort": "max"},
        ),
        ("qwen", "openai_chat", "qwen-plus", "none", {"enable_thinking": False}),
    ],
)
def test_reasoning_maps_only_known_capabilities(vendor, style, model, effort, expected):
    settings = config(llm_vendor=vendor, api_style=style, model=model, reasoning_effort=effort)
    opener = FixtureTransport(response(style))
    create_client(settings, opener=opener).complete(MESSAGES)
    body = json.loads(opener.requests[0][0].data)
    assert all(body[key] == value for key, value in expected.items())


@pytest.mark.parametrize(
    "options",
    [
        {
            "llm_vendor": "custom",
            "api_style": "openai_chat",
            "base_url": "https://example.test",
            "model": "gpt-5.2",
            "reasoning_effort": "high",
        },
        {"llm_vendor": "openai", "model": "unknown", "reasoning_effort": "high"},
        {"llm_vendor": "openai", "model": "gpt-5.2", "reasoning_effort": "max"},
        {"llm_vendor": "anthropic", "reasoning_effort": "minimal"},
        {"llm_vendor": "qwen", "reasoning_effort": "high"},
    ],
)
def test_unsupported_effort_never_contacts_server(options):
    opener = FixtureTransport(b"{}")
    with pytest.raises(ConfigurationError):
        create_client(config(**options), opener=opener).complete(MESSAGES)
    assert not opener.requests


@pytest.mark.parametrize("style", STYLES)
@pytest.mark.parametrize(
    "status,exception",
    [
        (401, PermanentLLMError),
        (403, PermanentLLMError),
        (408, TemporaryLLMError),
        (429, TemporaryLLMError),
        (500, TemporaryLLMError),
        (501, TemporaryLLMError),
        (599, TemporaryLLMError),
        (307, PermanentLLMError),
    ],
)
def test_uniform_errors_and_no_body_leak(style, status, exception):
    opener = FixtureTransport(HTTPError("https://example.test", status, "PRIVATE", {}, None))
    with pytest.raises(exception) as error:
        create_client(config(api_style=style), opener=opener).complete(MESSAGES)
    assert "PRIVATE" not in str(error.value) and len(opener.requests) == 1


@pytest.mark.parametrize("style", STYLES)
@pytest.mark.parametrize("failure", [TimeoutError(), URLError("PRIVATE")])
def test_network_failure(style, failure):
    with pytest.raises(TemporaryLLMError):
        create_client(config(api_style=style), opener=FixtureTransport(failure)).complete(MESSAGES)


@pytest.mark.parametrize("style", STYLES)
@pytest.mark.parametrize(
    "raw",
    [b"bad json", b"{}", b"null", b"[]", b"x" * 262145],
    ids=["invalid", "missing", "null", "array", "oversized"],
)
def test_invalid_envelope(style, raw):
    with pytest.raises(InvalidOutputError):
        create_client(config(api_style=style), opener=FixtureTransport(raw)).complete(MESSAGES)


@pytest.mark.parametrize("style", STYLES)
@pytest.mark.parametrize("kind", ["empty", "truncated", "missing"])
def test_no_false_success(style, kind):
    data = response(style, "" if kind == "empty" else TEXT)
    if kind == "missing":
        data.pop(
            {
                "openai_chat": "choices",
                "openai_responses": "output",
                "anthropic_messages": "content",
            }[style]
        )
    if kind == "truncated":
        if style == "openai_chat":
            data["choices"][0]["finish_reason"] = "length"
        else:
            data["status" if style == "openai_responses" else "stop_reason"] = (
                "incomplete" if style == "openai_responses" else "max_tokens"
            )
    with pytest.raises(InvalidOutputError):
        create_client(config(api_style=style), opener=FixtureTransport(data)).complete(MESSAGES)


def test_legacy_key_is_only_for_deepseek_and_canonical_wins(monkeypatch, tmp_path):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "legacy-fixture")
    assert DiagnosisSettings(_env_file=None).api_key.get_secret_value() == "legacy-fixture"
    assert DiagnosisSettings(_env_file=None, llm_vendor="openai").api_key.get_secret_value() == ""
    monkeypatch.setenv("T5_DIAGNOSIS_API_KEY", "canonical-fixture")
    assert DiagnosisSettings(_env_file=None).api_key.get_secret_value() == "canonical-fixture"
    assert "canonical-fixture" not in repr(DiagnosisSettings(_env_file=None))
    path = tmp_path / ".env"
    path.write_text(
        "T5_DIAGNOSIS_LLM_VENDOR=custom\nT5_DIAGNOSIS_API_STYLE=openai_chat\nT5_DIAGNOSIS_BASE_URL=https://example.test/gateway\nT5_DIAGNOSIS_MODEL=fixture-model\n",
        encoding="utf-8",
    )
    assert (
        DiagnosisSettings(_env_file=path).endpoint
        == "https://example.test/gateway/chat/completions"
    )


def test_redirect_block_and_request_size():
    assert NoRedirect().redirect_request(None, None, 302, None, None, "https://evil.test") is None
    opener = FixtureTransport(response("openai_chat"))
    with pytest.raises(ConfigurationError):
        create_client(config(), opener=opener).complete([{"role": "user", "content": "x" * 524289}])
    assert not opener.requests


@pytest.mark.parametrize("style", STYLES)
def test_missing_key_each_protocol(style):
    opener = FixtureTransport(response(style))
    with pytest.raises(ConfigurationError):
        create_client(config(api_style=style, api_key=""), opener=opener).complete(MESSAGES)
    assert not opener.requests


@pytest.mark.parametrize("style", STYLES)
def test_live_acceptance_harness_with_explicit_fixture(style):
    from tests.diagnosis.accept_live import run

    text = "使用 Python 清洗课程数据，处理 120 条记录，使用 SQL 汇总结果。"
    final = MockLLM().complete(build_messages(text, "Python SQL"))
    result = run(settings=config(api_style=style), opener=FixtureTransport(response(style, final)))
    assert result["status"] == "passed" and result["fact_guard"] and result["star_present"]
    assert len(result["attempts"]) == 1


def test_responses_only_final_text_and_refusal():
    data = response("openai_responses")
    data["output"].insert(
        1,
        {
            "type": "message",
            "role": "assistant",
            "status": "completed",
            "phase": "commentary",
            "content": [{"type": "output_text", "text": "PRIVATE commentary"}],
        },
    )
    client = create_client(config(api_style="openai_responses"), opener=FixtureTransport(data))
    assert client.complete(MESSAGES) == TEXT
    data["output"][-1]["content"] = [{"type": "refusal", "refusal": "no"}]
    with pytest.raises(InvalidOutputError):
        client.complete(MESSAGES)


@pytest.mark.parametrize("style", STYLES)
def test_strict_diagnosis_schema_and_safe_usage(style):
    inputs = DiagnosisInput(resume_text="使用 Python 清洗数据", jd_text="需要 SQL 数据分析")
    valid = MockLLM().complete(build_messages(inputs.resume_text, inputs.jd_text))
    data = response(style, valid)
    data["usage"] = {"input_tokens": 123, "output_tokens": 45, "private": "PRIVATE"}
    metrics = []
    client = create_client(
        config(api_style=style), opener=FixtureTransport(data), on_attempt=metrics.append
    )
    result = DiagnosisService(client, settings=config(api_style=style)).diagnose(inputs)
    assert set(result.model_dump()) == {"summary", "suggestions"}
    assert "PRIVATE" not in str(result) + str(metrics)
    assert metrics[0]["input_tokens"] == 123 and metrics[0]["latency_seconds"] >= 0
    invalid = create_client(config(api_style=style), opener=FixtureTransport(response(style, "{}")))
    with pytest.raises(InvalidOutputError):
        DiagnosisService(invalid, settings=config(max_attempts=1)).diagnose(inputs)
