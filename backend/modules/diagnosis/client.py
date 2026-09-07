import json
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .config import DiagnosisSettings
from .errors import (
    ConfigurationError,
    InvalidOutputError,
    PermanentLLMError,
    TemporaryLLMError,
)


class LLMClient(Protocol):
    def complete(self, messages: list[dict]) -> str: ...


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Do not forward credentials to a redirected destination.


class DeepSeekClient:
    """One transport attempt; the service owns the only retry loop."""

    def __init__(self, settings: DiagnosisSettings, *, opener=None):
        self.settings = settings
        self.opener = opener or build_opener(NoRedirect)

    def complete(self, messages: list[dict]) -> str:
        key = self.settings.api_key.get_secret_value().strip()
        if not key:
            raise ConfigurationError("未配置 DEEPSEEK_API_KEY，请设置后重启服务")
        body = {
            "model": self.settings.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "max_tokens": self.settings.max_tokens,
            "stream": False,
        }
        if self.settings.base_url in ("https://api.deepseek.com", "https://api.deepseek.com/v1"):
            body["thinking"] = {"type": "disabled"}
        request = Request(
            self.settings.base_url + "/chat/completions",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self.opener.open(request, timeout=self.settings.timeout_seconds) as response:
                raw = response.read(262145)
        except HTTPError as error:
            code = error.code
            error.close()
            if code in (408, 429, 500, 502, 503, 504):
                raise TemporaryLLMError("模型服务暂不可用") from None
            raise PermanentLLMError("模型请求被拒绝，请检查密钥、余额和模型配置") from None
        except (TimeoutError, URLError, OSError):
            raise TemporaryLLMError("模型请求超时或连接失败") from None
        if len(raw) > 262144:
            raise InvalidOutputError("模型响应过长")
        try:
            response = json.loads(raw)
            choice = response["choices"][0]
            if choice["finish_reason"] != "stop":
                raise InvalidOutputError("模型输出被截断或未正常结束")
            content = choice["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise InvalidOutputError("模型未返回有效文本")
            return content
        except (ValueError, KeyError, IndexError, TypeError, RecursionError):
            raise InvalidOutputError("模型响应格式无效") from None
