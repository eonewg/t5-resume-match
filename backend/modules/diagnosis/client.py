"""Three wire adapters, one bounded transport. Retries belong to DiagnosisService."""

import json
import time
from http.client import HTTPException
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .capabilities import reasoning
from .config import DiagnosisSettings
from .errors import ConfigurationError, InvalidOutputError, PermanentLLMError, TemporaryLLMError


class LLMClient(Protocol):
    def complete(self, messages: list[dict]) -> str: ...


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class HTTPClient:
    def __init__(self, settings: DiagnosisSettings, *, opener=None, on_attempt=None):
        self.settings = settings
        self.opener = opener or build_opener(NoRedirect)
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
        metrics = {"input_tokens": None, "output_tokens": None, "status": "error"}
        try:
            try:
                with self.opener.open(request, timeout=self.settings.timeout_seconds) as response:
                    raw = response.read(262145)
            except HTTPError as error:
                code = error.code
                error.close()
                if code in (408, 429) or 500 <= code <= 599:
                    raise TemporaryLLMError("模型服务暂不可用") from None
                raise PermanentLLMError(
                    "模型请求被拒绝，请检查密钥、余额、地址和模型配置"
                ) from None
            except (TimeoutError, URLError, OSError, HTTPException):
                raise TemporaryLLMError("模型请求超时或连接失败") from None
            if len(raw) > 262144:
                raise InvalidOutputError("模型响应过长")
            try:
                document = json.loads(raw)
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
                raise InvalidOutputError("模型响应格式无效、为空或未正常结束") from None
        finally:
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
        if config.llm_vendor != "custom":
            body["response_format"] = {"type": "json_object"}
        if effort is not None:
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
