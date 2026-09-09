import hashlib
import json
import logging
import re
import threading
import time
from collections import OrderedDict

from pydantic import ValidationError

from backend.schemas.contracts import DiagnosisInput, DiagnosisResult

from .client import LLMClient, create_client
from .config import DiagnosisSettings
from .errors import (
    ConfigurationError,
    DiagnosisError,
    FactGuardError,
    InvalidOutputError,
    PermanentLLMError,
    TemporaryLLMError,
)
from .prompts import PROMPT_VERSION, build_messages
from .schema import DiagnosisDetail, parse_detail
from .transport import attempt_context, transport_metrics


class DiagnosisService:
    def __init__(
        self,
        client: LLMClient | None = None,
        *,
        settings=None,
        clock=time.monotonic,
        sleep=time.sleep,
        on_attempt=None,
    ):
        try:
            self.settings = settings if settings is not None else DiagnosisSettings()
        except ValidationError:
            raise ConfigurationError("Diagnosis 模型配置无效，请检查本机配置") from None
        self.client = client if client is not None else create_client(self.settings)
        self.is_mock = getattr(self.client, "is_mock", False) is True
        self._clock, self._sleep = clock, sleep
        self.on_attempt = on_attempt
        self._cache: OrderedDict[str, tuple[float, DiagnosisDetail]] = OrderedDict()
        self._cache_lock = threading.Lock()
        # Fixed stripes keep memory bounded and coalesce simultaneous identical inputs.
        self._stripes = [threading.Lock() for _ in range(16)]

    def diagnose(self, data: DiagnosisInput) -> DiagnosisResult:
        detail = self.diagnose_detail(data)
        suggestions = [
            f"【STAR】原文：{r.original}\n优化：{r.optimized}\n理由：{r.reason}"
            for r in detail.star_rewrites
        ]
        suggestions += ["【岗位建议】" + item for item in detail.jd_targeted_suggestions]
        suggestions += ["【关键词·待核实】" + item for item in detail.keywords_to_strengthen]
        suggestions += ["【风险提醒】" + item for item in detail.risks]
        return DiagnosisResult(summary=detail.summary, suggestions=suggestions)

    def diagnose_detail(self, data: DiagnosisInput) -> DiagnosisDetail:
        deadline = self._clock() + self.settings.total_timeout_seconds
        # Revalidate even an instance made with model_construct or modified by a caller.
        data = DiagnosisInput.model_validate(
            data.model_dump() if isinstance(data, DiagnosisInput) else data
        )
        payload = [
            PROMPT_VERSION,
            self.settings.model,
            self.settings.base_url,
            self.settings.llm_vendor,
            self.settings.api_style,
            self.settings.endpoint,
            self.settings.reasoning_effort,
            data.resume_text,
            data.jd_text,
        ]
        key = hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()
        stripe = self._stripes[int(key[:2], 16) % len(self._stripes)]
        if not stripe.acquire(timeout=max(0, deadline - self._clock())):
            raise TemporaryLLMError("诊断等待已达上限", category="timeout", phase="queue")
        try:
            with self._cache_lock:
                now = self._clock()
                for stale in [k for k, (expires, _) in self._cache.items() if expires <= now]:
                    del self._cache[stale]
                if key in self._cache:
                    self._cache.move_to_end(key)
                    return self._cache[key][1].model_copy(deep=True)
            detail = self._complete_detail(data, deadline)
            with self._cache_lock:
                if self.settings.cache_size and self.settings.cache_ttl_seconds:
                    self._cache[key] = (
                        self._clock() + self.settings.cache_ttl_seconds,
                        detail.model_copy(deep=True),
                    )
                    while len(self._cache) > self.settings.cache_size:
                        self._cache.popitem(last=False)
            return detail
        finally:
            stripe.release()

    def _complete_detail(self, data, deadline):
        repairs = 0
        for attempt in range(1, self.settings.max_attempts + 1):
            remaining = deadline - self._clock()
            if remaining <= 0:
                raise TemporaryLLMError("诊断等待已达上限", category="timeout", phase="total")
            started = self._clock()
            token = attempt_context.set((attempt, remaining))
            event = {
                "vendor": self.settings.llm_vendor,
                "model": self.settings.model
                if re.fullmatch(r"[\w./:-]{1,100}", self.settings.model)
                else "configured",
                "attempt": attempt,
                "error_category": None,
                "http_status": None,
                "phase": None,
                "status": "error",
                "retry": False,
                "backoff_seconds": 0,
            }
            observation_token = transport_metrics.set(event)
            try:
                raw = self.client.complete(
                    build_messages(data.resume_text, data.jd_text, repair=repairs > 0)
                )
                try:
                    detail = parse_detail(raw, data.resume_text, on_filtered=event.update)
                except InvalidOutputError as error:
                    error.phase = "output_validation"
                    if isinstance(error, FactGuardError):
                        error.phase = "fact_guard"
                    else:
                        diagnostic_raw = raw.strip() if isinstance(raw, str) else ""
                        fenced = re.fullmatch(
                            r"```(?:json)?\s*\n?(.*?)\n?```", diagnostic_raw, re.DOTALL
                        )
                        try:
                            json.loads(fenced[1] if fenced else diagnostic_raw)
                        except (ValueError, RecursionError):
                            error.phase = "output_json"
                    raise
                event["status"] = "validated"
                return detail
            except DiagnosisError as error:
                if error.code is None:
                    error.code = event["http_status"]
                event.update(error.metadata())
                can_retry = error.retryable and error.category in (
                    "timeout",
                    "rate_limit",
                    "upstream_5xx",
                    "connection_error",
                )
                if isinstance(error, InvalidOutputError):
                    # Separate opt-in model repair, only for business JSON validation.
                    can_retry = (
                        error.phase in ("output_json", "output_validation")
                        and repairs < self.settings.output_retries
                    )
                    if can_retry:
                        repairs += 1
                if not can_retry or attempt >= self.settings.max_attempts:
                    raise
                delay = min(self.settings.backoff_seconds * 2 ** (attempt - 1), 5)
                if error.retry_after is not None:
                    # Do not violate an upstream minimum by clipping it and replaying early.
                    if error.retry_after > self.settings.retry_after_cap_seconds:
                        event["stop_reason"] = "retry_after_exceeds_budget"
                        raise
                    delay = max(delay, error.retry_after)
                if deadline - self._clock() <= delay:
                    event["stop_reason"] = "total_budget_exhausted"
                    raise
                event.update(retry=True, backoff_seconds=delay)
            except Exception:
                event.update(error_category="unknown", phase="unexpected")
                raise PermanentLLMError("诊断服务出现异常", phase="unexpected") from None
            finally:
                attempt_context.reset(token)
                transport_metrics.reset(observation_token)
                event["elapsed_seconds"] = round(self._clock() - started, 6)
                logging.getLogger(__name__).info(
                    "diagnosis_attempt %s", json.dumps(event, ensure_ascii=False)
                )
                if self.on_attempt is not None:
                    try:
                        self.on_attempt(dict(event))
                    except Exception:
                        pass
            self._sleep(delay)

    def clear_cache(self) -> None:
        with self._cache_lock:
            self._cache.clear()
