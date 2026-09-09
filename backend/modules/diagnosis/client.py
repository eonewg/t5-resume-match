"""Three wire adapters, one bounded transport. Retries belong to DiagnosisService."""

import json
import logging
import time
from typing import Protocol
from urllib.request import Request

from .capabilities import reasoning
from .config import DiagnosisSettings
from .errors import ConfigurationError, DiagnosisError, InvalidOutputError
from .transport import NoRedirect as NoRedirect
from .transport import attempt_context, bounded_request, classify, raise_failure, transport_metrics


def response_envelope_shape(document):
    """Protocol structure only; redact unknown keys and nonstandard control values."""
    known_keys = {
        "id",
        "object",
        "created",
        "model",
        "choices",
        "usage",
        "system_fingerprint",
        "service_tier",
        "error",
        "code",
        "message",
        "data",
        "status",
        "output",
        "type",
        "content",
        "index",
        "finish_reason",
        "logprobs",
        "delta",
        "role",
        "refusal",
        "reasoning_content",
        "reasoning",
        "tool_calls",
        "function_call",
        "audio",
        "annotations",
        "name",
        "summary",
        "star_rewrites",
        "jd_targeted_suggestions",
        "keywords_to_strengthen",
        "risks",
    }

    def keys(value):
        return (
            [key if key in known_keys else "<other>" for key in value][:32]
            if isinstance(value, dict)
            else []
        )

    def control(value, allowed):
        return (
            value
            if value is None or isinstance(value, str) and value in allowed
            else "<nonstandard>"
        )

    choices = document.get("choices") if isinstance(document, dict) else None
    choice = choices[0] if isinstance(choices, list) and choices else None
    message = choice.get("message") if isinstance(choice, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    return {
        "top_level_keys": keys(document),
        "choices_count": len(choices) if isinstance(choices, list) else None,
        "choice_keys": keys(choice),
        "finish_reason": control(
            choice.get("finish_reason") if isinstance(choice, dict) else None,
            {
                "stop",
                "length",
                "tool_calls",
                "function_call",
                "content_filter",
                "end_turn",
                "completed",
                "max_tokens",
                "",
            },
        ),
        "message_keys": keys(message),
        "role": control(
            message.get("role") if isinstance(message, dict) else None,
            {"assistant", "user", "system", "developer", "tool", "function", "model", ""},
        ),
        "content_type": "null" if content is None else type(content).__name__,
        "has_reasoning_content": isinstance(message, dict) and "reasoning_content" in message,
    }


class LLMClient(Protocol):
    def complete(self, messages: list[dict]) -> str: ...


class HTTPClient:
    def __init__(self, settings: DiagnosisSettings, *, opener=None, on_attempt=None):
        self.settings = settings
        self.opener = opener
        self.on_attempt = on_attempt

    def headers(self, key):
        return {"Authorization": "Bearer " + key, "Content-Type": "application/json"}

    def complete(self, messages):
        key = self.settings.api_key.get_secret_value().strip()
        if not key or any(c.isspace() or not 32 <= ord(c) < 127 for c in key):
            raise ConfigurationError(
                "请配置有效 T5_DIAGNOSIS_API_KEY（DeepSeek 兼容 DEEPSEEK_API_KEY）"
            )
        body = self.payload(messages, reasoning(self.settings))
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        if len(encoded) > 524288:
            raise ConfigurationError("模型请求超过 512 KiB 限制")
        request = Request(
            self.settings.endpoint, data=encoded, headers=self.headers(key), method="POST"
        )
        start = time.monotonic()
        metrics = {
            "input_tokens": None,
            "output_tokens": None,
            "status": "error",
            "error_category": None,
            "http_status": None,
            "phase": None,
        }
        try:
            if self.opener is None:
                raw, metrics["http_status"] = bounded_request(request, self.settings)
            else:
                # Explicit deterministic fixtures retain the legacy opener seam.
                try:
                    with self.opener.open(
                        request, timeout=self.settings.timeout_seconds
                    ) as response:
                        raw = response.read(262145)
                        metrics["http_status"] = getattr(response, "status", 200)
                except Exception as error:
                    raise_failure(classify(error))
            if len(raw) > 262144:
                raise InvalidOutputError("模型响应过长", phase="response_size")
            try:
                try:
                    document = json.loads(raw)
                except (ValueError, RecursionError):
                    raise InvalidOutputError(
                        "模型响应不是有效 JSON", phase="response_json"
                    ) from None
                if not isinstance(document, dict):
                    raise ValueError
                usage = document.get("usage") or {}
                if isinstance(usage, dict):
                    for target, legacy in (
                        ("input_tokens", "prompt_tokens"),
                        ("output_tokens", "completion_tokens"),
                    ):
                        value = usage.get(target, usage.get(legacy))
                        if type(value) is int and value >= 0:
                            metrics[target] = value
                content = self.extract(document)
                if not isinstance(content, str) or not content.strip():
                    raise ValueError
                metrics["status"] = "text"
                return content
            except (ValueError, KeyError, IndexError, TypeError, AttributeError, RecursionError):
                metrics["envelope_shape"] = response_envelope_shape(document)
                logging.getLogger(__name__).warning(
                    "diagnosis envelope_shape %s", json.dumps(metrics["envelope_shape"])
                )
                if metrics["envelope_shape"]["finish_reason"] == "content_filter":
                    raise InvalidOutputError(
                        "上游模型内容过滤，未生成简历诊断", phase="content_filter"
                    ) from None
                raise InvalidOutputError(
                    "模型响应格式无效、为空或未正常结束", phase="response_envelope"
                ) from None
        except DiagnosisError as error:
            if error.code is None:
                error.code = metrics["http_status"]
            metrics.update(error.metadata())
            raise
        finally:
            observation = transport_metrics.get()
            if observation is not None:
                observation.update(
                    {k: metrics[k] for k in ("http_status", "input_tokens", "output_tokens")}
                )
            metrics.update(
                vendor=self.settings.llm_vendor,
                model=self.settings.model,
                attempt=attempt_context.get()[0],
            )
            if self.on_attempt is not None:
                try:
                    self.on_attempt({**metrics, "latency_seconds": time.monotonic() - start})
                except Exception:
                    pass  # Optional metrics cannot alter business results.


class OpenAIChatClient(HTTPClient):
    def payload(self, messages, effort):
        config = self.settings
        body = {"model": config.model, "messages": messages, "stream": False}
        body["max_completion_tokens" if config.llm_vendor == "openai" else "max_tokens"] = (
            config.max_tokens
        )
        ling_flash = config.llm_vendor == "custom" and config.model.casefold() == "ling-3.0-flash"
        if config.llm_vendor != "custom" or ling_flash:
            body["response_format"] = {"type": "json_object"}
        if ling_flash:
            body["thinking"] = {"type": "disabled"}
        elif effort is not None:
            if config.llm_vendor == "deepseek":
                body["thinking"] = {"type": "disabled" if effort == "none" else "enabled"}
                if effort != "none":
                    body["reasoning_effort"] = effort
            elif config.llm_vendor == "qwen":
                body["enable_thinking"] = False
            else:
                body["reasoning_effort"] = effort
        return body

    def extract(self, data):
        choice = data["choices"][0]
        if choice.get("finish_reason") == "length":
            raise InvalidOutputError("模型输出未完整生成", phase="output_truncated")
        if (
            choice["finish_reason"] != "stop"
            or choice["message"].get("refusal")
            or choice["message"].get("role", "assistant") != "assistant"
        ):
            raise ValueError
        return choice["message"]["content"]


class OpenAIResponsesClient(HTTPClient):
    def payload(self, messages, effort):
        body = {
            "model": self.settings.model,
            "input": messages,
            "max_output_tokens": self.settings.max_tokens,
            "stream": False,
            "store": False,
        }
        if self.settings.llm_vendor != "custom":
            body["text"] = {"format": {"type": "json_object"}}
        if effort is not None:
            body["reasoning"] = {"effort": effort}
        return body

    def extract(self, data):
        if data.get("status") == "incomplete":
            raise InvalidOutputError("模型输出未完整生成", phase="output_truncated")
        if data["status"] != "completed" or data.get("error") or data.get("incomplete_details"):
            raise ValueError
        texts = []
        for item in data["output"]:
            if item["type"] == "reasoning":
                continue
            if (
                item["type"] != "message"
                or item["role"] != "assistant"
                or item["status"] != "completed"
            ):
                raise ValueError
            if item.get("phase") == "commentary":
                continue
            if item.get("phase") not in (None, "final_answer"):
                raise ValueError
            for block in item["content"]:
                if block["type"] != "output_text" or not isinstance(block["text"], str):
                    raise ValueError
                texts.append(block["text"])
        return "".join(texts)


class AnthropicMessagesClient(HTTPClient):
    def headers(self, key):
        return {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    def payload(self, messages, effort):
        system, turns = [], []
        for message in messages:
            if message["role"] == "system":
                system.append(message["content"])
            elif message["role"] in ("user", "assistant"):
                turns.append({"role": message["role"], "content": message["content"]})
            else:
                raise ConfigurationError("Messages 协议不支持此消息角色")
        body = {
            "model": self.settings.model,
            "system": "\n\n".join(system),
            "messages": turns,
            "max_tokens": self.settings.max_tokens,
            "stream": False,
        }
        if effort is not None:
            if effort == "none":
                body["thinking"] = {"type": "disabled"}
            else:
                body["thinking"] = {
                    "type": "enabled" if self.settings.llm_vendor == "deepseek" else "adaptive"
                }
                body["output_config"] = {"effort": effort}
        return body

    def extract(self, data):
        if data.get("stop_reason") == "max_tokens":
            raise InvalidOutputError("模型输出未完整生成", phase="output_truncated")
        if (
            data["type"] != "message"
            or data["role"] != "assistant"
            or data["stop_reason"] != "end_turn"
        ):
            raise ValueError
        texts = []
        for block in data["content"]:
            if block["type"] in ("thinking", "redacted_thinking"):
                continue
            if block["type"] != "text" or not isinstance(block["text"], str):
                raise ValueError
            texts.append(block["text"])
        return "".join(texts)


DeepSeekClient = OpenAIChatClient  # Import compatibility, not a duplicate transport.


def create_client(settings, **kwargs):
    adapters = {
        "openai_chat": OpenAIChatClient,
        "openai_responses": OpenAIResponsesClient,
        "anthropic_messages": AnthropicMessagesClient,
    }
    return adapters[settings.api_style](settings, **kwargs)
