"""Explicit Jobicy snapshot import. Public feed only; no resume or user data is sent."""

import json
import math
import re
import threading
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import text

from backend.core.paths import RUNTIME_ROOT
from backend.core.services import parse_job_data
from backend.models.entities import JDRow
from backend.schemas.contracts import ExternalImportResult, JDCreate

FEED_URL = "https://jobicy.com/api/v2/remote-jobs?count=200"
CACHE_PATH = RUNTIME_ROOT / ".runtime" / "jobicy.json"
CACHE_SECONDS = 3600
_lock = threading.Lock()


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        if not self.hidden and tag in {"p", "br", "li", "div", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
        if not self.hidden and tag in {"p", "li", "div"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(str(value or ""))
    return "\n".join(line.strip() for line in "".join(parser.parts).splitlines() if line.strip())


def fetch_feed(cache_path: Path = CACHE_PATH):
    """Reuse a persisted hourly cache, including after application restart."""
    with _lock:
        now = datetime.now(UTC)
        if cache_path.exists():
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                age = (now - datetime.fromisoformat(cached["fetched_at"])).total_seconds()
                if 0 <= age < CACHE_SECONDS and isinstance(cached["jobs"], list):
                    return cached, True
            except (OSError, ValueError, KeyError, TypeError):
                pass
        try:
            with httpx.Client(timeout=30, follow_redirects=False) as client:
                with client.stream(
                    "GET", FEED_URL, headers={"User-Agent": "T5-Market-Insights/1.0"}
                ) as response:
                    response.raise_for_status()
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > 8 * 1024 * 1024:
                            raise ValueError("feed too large")
                        chunks.append(chunk)
            content = json.loads(b"".join(chunks))
            if not isinstance(content, dict) or not isinstance(content.get("jobs"), list):
                raise ValueError("invalid feed")
            cached = {"fetched_at": now.isoformat(), "jobs": content["jobs"][:200]}
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temp = cache_path.with_suffix(".tmp")
            temp.write_text(json.dumps(cached, ensure_ascii=False), encoding="utf-8")
            temp.replace(cache_path)
            return cached, False
        except (httpx.HTTPError, ValueError, OSError) as error:
            raise HTTPException(
                502, "Jobicy 暂时无法同步；已保存岗位保持不变，请稍后重试。"
            ) from error


def number(value):
    if isinstance(value, bool) or value is None or value == "":
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) and value >= 0 else None
    except (TypeError, ValueError):
        return None


def to_job(raw, collected):
    if not isinstance(raw, dict) or type(raw.get("id")) is not int or raw["id"] <= 0:
        raise ValueError("missing upstream id")
    link = str(raw.get("url") or "")
    parsed = urlsplit(link)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"jobicy.com", "www.jobicy.com"}
        or parsed.username
    ):
        raise ValueError("invalid source link")
    body = plain(raw.get("jobDescription"))
    if not body:
        raise ValueError("empty description")
    # Preserve provider metadata in source text; the application does not infer location or date.
    metadata = "\n".join(
        f"{label}: {plain(raw[key])}"
        for key, label in (("jobGeo", "Location"), ("jobLevel", "Level"), ("pubDate", "Published"))
        if raw.get(key)
    )
    lower, upper = number(raw.get("salaryMin")), number(raw.get("salaryMax"))
    if lower is not None and upper is not None and lower > upper:
        lower = upper = None
    currency = str(raw.get("salaryCurrency") or "").upper() or None
    period = {
        "hourly": "hour",
        "daily": "day",
        "monthly": "month",
        "yearly": "year",
        "annual": "year",
    }.get(str(raw.get("salaryPeriod") or "").lower())
    salary = None
    if raw.get("salaryMin") is not None or raw.get("salaryMax") is not None:
        salary = f"{raw.get('salaryMin', '?')}–{raw.get('salaryMax', '?')} {raw.get('salaryCurrency', '')} / {raw.get('salaryPeriod', 'unknown')}"
    return JDCreate(
        title=plain(raw.get("jobTitle")),
        company=plain(raw.get("companyName")) or None,
        jd_text=f"{metadata}\n\n{body}".strip(),
        source_type="real",
        source_url=link,
        source_name="Jobicy · 全球远程岗位",
        collected_at=collected,
        salary=salary,
        salary_min=lower,
        salary_max=upper,
        currency=currency,
        salary_period=period,
    )


def parsed_payload(provider, data):
    payload = parse_job_data(provider, data).model_dump(mode="json")
    # The broad feed includes sales/operations roles. Bare English "go" is not
    # evidence of the Go language; keep only explicit language/stack contexts.
    source = f"{data.title}\n{data.jd_text}"
    go_context = re.search(
        r"\bgolang\b|\bgo(?:\s+programming)?\s+(?:language|developer|engineer)\b"
        r"|(?:written|programming|code|coding)\s+in\s+go\b"
        r"|(?:languages?|stack|proficiency|experience)\s*[:：]\s*go\b"
        r"|[,(／/]\s*go\s*[,)/／]|\bgo\s*[,/／]\s*(?:python|java|rust|c\+\+)"
        r"|\bgo语言",
        source,
        re.I,
    )
    if not go_context:
        payload["skills"] = [skill for skill in payload["skills"] if skill != "Go"]
        payload["tools"] = [skill for skill in payload["tools"] if skill != "Go"]
    return payload


def import_external_jobs(session, provider, source="jobicy"):
    if provider.is_mock:
        raise HTTPException(409, "请先启用真实 JD 解析，再同步外部岗位。")
    if source == "ncss":
        from backend.core.china_jobs import fetch_feed as fetch_china
        from backend.core.china_jobs import to_job as china_job

        feed, cached = fetch_china()
        convert = china_job
    else:
        feed, cached = fetch_feed()
        convert = to_job
    collected = datetime.fromisoformat(feed["fetched_at"]).date()
    if session.get_bind().dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(5450003)"))
    created, existing, skipped, ids = 0, 0, 0, []
    seen = set()
    for raw in feed["jobs"]:
        try:
            data = convert(raw, collected)
        except (ValueError, TypeError, ValidationError):
            skipped += 1
            continue
        identifier = f"jd_{source}_{raw['jobId'] if source == 'ncss' else raw['id']}"
        if identifier in seen:
            skipped += 1
            continue
        seen.add(identifier)
        if session.get(JDRow, identifier) is not None:
            existing += 1
        else:
            payload = parsed_payload(provider, data)
            session.add(JDRow(id=identifier, payload=payload, is_mock=False))
            session.flush()
            created += 1
        ids.append(identifier)
    return ExternalImportResult(
        created=created,
        existing=existing,
        skipped=skipped,
        jd_ids=ids,
        fetched_at=feed["fetched_at"],
        cached=cached,
        source="国家大学生就业服务平台" if source == "ncss" else "Jobicy",
    )
