import hashlib
import json
import threading
import time
from collections import OrderedDict

from backend.schemas.contracts import DiagnosisInput, DiagnosisResult

from .client import DeepSeekClient, LLMClient
from .config import DiagnosisSettings
from .errors import InvalidOutputError, TemporaryLLMError
from .prompts import PROMPT_VERSION, build_messages
from .schema import DiagnosisDetail, parse_detail


class DiagnosisService:
    def __init__(
        self,
        client: LLMClient | None = None,
        *,
        settings=None,
        clock=time.monotonic,
        sleep=time.sleep,
    ):
        self.settings = settings if settings is not None else DiagnosisSettings()
        self.client = client if client is not None else DeepSeekClient(self.settings)
        self._clock, self._sleep = clock, sleep
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
        # Revalidate even an instance made with model_construct or modified by a caller.
        data = DiagnosisInput.model_validate(
            data.model_dump() if isinstance(data, DiagnosisInput) else data
        )
        payload = [
            PROMPT_VERSION,
            self.settings.model,
            self.settings.base_url,
            data.resume_text,
            data.jd_text,
        ]
        key = hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()
        with self._stripes[int(key[:2], 16) % len(self._stripes)]:
            with self._cache_lock:
                now = self._clock()
                for stale in [k for k, (expires, _) in self._cache.items() if expires <= now]:
                    del self._cache[stale]
                if key in self._cache:
                    self._cache.move_to_end(key)
                    return self._cache[key][1].model_copy(deep=True)
            repair = False
            for attempt in range(self.settings.max_attempts):
                try:
                    raw = self.client.complete(
                        build_messages(data.resume_text, data.jd_text, repair=repair)
                    )
                    detail = parse_detail(raw, data.resume_text)
                    break
                except (TemporaryLLMError, InvalidOutputError) as error:
                    repair = repair or isinstance(error, InvalidOutputError)
                    if attempt + 1 == self.settings.max_attempts:
                        raise
                    self._sleep(min(2**attempt, 4))
            with self._cache_lock:
                if self.settings.cache_size and self.settings.cache_ttl_seconds:
                    self._cache[key] = (
                        self._clock() + self.settings.cache_ttl_seconds,
                        detail.model_copy(deep=True),
                    )
                    while len(self._cache) > self.settings.cache_size:
                        self._cache.popitem(last=False)
            return detail

    def clear_cache(self) -> None:
        with self._cache_lock:
            self._cache.clear()
