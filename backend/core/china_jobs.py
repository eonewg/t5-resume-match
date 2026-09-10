"""Public NCSS recruitment snapshots, with explicit K CNY/month conversion."""

import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import HTTPException

from backend.core.external_jobs import CACHE_SECONDS, number, plain
from backend.core.paths import RUNTIME_ROOT
from backend.schemas.contracts import JDCreate

CACHE_PATH = RUNTIME_ROOT / ".runtime" / "ncss.json"
LIST_URL = "https://www.ncss.cn/student/jobs/jobslist/ajax/?offset=1&limit=30"
_lock = threading.Lock()


def source_url(identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9]{8,64}", identifier):
        raise ValueError("invalid NCSS id")
    return f"https://www.ncss.cn/student/jobs/{identifier}/detail.html"


def description(html):
    match = re.search(
        r'<pre\b[^>]*class=["\'][^"\']*\bmainContent\b[^"\']*["\'][^>]*>(.*?)</pre>',
        html,
        re.S | re.I,
    )
    return plain(match.group(1)) if match else ""


def read(client, url):
    with client.stream("GET", url) as response:
        response.raise_for_status()
        chunks, size = [], 0
        for chunk in response.iter_bytes():
            size += len(chunk)
            if size > 4 * 1024 * 1024:
                raise ValueError("NCSS response too large")
            chunks.append(chunk)
    return b"".join(chunks).decode("utf-8")


def fetch_feed(cache_path: Path = CACHE_PATH):
    with _lock:
        now = datetime.now(UTC)
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            age = (now - datetime.fromisoformat(cached["fetched_at"])).total_seconds()
            if 0 <= age < CACHE_SECONDS and isinstance(cached["jobs"], list):
                return cached, True
        except (OSError, ValueError, KeyError, TypeError):
            pass
        try:
            with httpx.Client(timeout=20, follow_redirects=False) as client:
                listing = json.loads(read(client, LIST_URL))
                if listing.get("flag") is not True or not isinstance(
                    listing.get("data", {}).get("list"), list
                ):
                    raise ValueError("invalid NCSS list")

                def detail(raw):
                    if not isinstance(raw, dict):
                        return {}
                    try:
                        body = description(read(client, source_url(raw.get("jobId"))))
                    except (httpx.HTTPError, ValueError):
                        body = ""
                    return {**raw, "description": body}

                with ThreadPoolExecutor(max_workers=3) as pool:
                    jobs = list(pool.map(detail, listing["data"]["list"][:30]))
            if not any(job.get("description") for job in jobs):
                raise ValueError("no readable NCSS descriptions")
            cached = {"fetched_at": now.isoformat(), "jobs": jobs}
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temp = cache_path.with_suffix(".tmp")
            temp.write_text(json.dumps(cached, ensure_ascii=False), encoding="utf-8")
            temp.replace(cache_path)
            return cached, False
        except (httpx.HTTPError, ValueError, OSError) as error:
            raise HTTPException(
                502, "国内招聘来源暂时无法同步；已保存岗位保持不变，请稍后重试。"
            ) from error


def to_job(raw, collected):
    if not isinstance(raw, dict):
        raise ValueError("invalid NCSS record")
    link = source_url(raw.get("jobId"))
    body = plain(raw.get("description"))
    if not body:
        raise ValueError("missing NCSS description")
    lower, upper = number(raw.get("lowMonthPay")), number(raw.get("highMonthPay"))
    # The official listing formatter displays 0/0 as 面议 and other values as K/月.
    if lower is None or upper is None or lower <= 0 or upper <= 0 or lower > upper:
        lower = upper = None
    metadata = "\n".join(
        f"{label}：{plain(raw[key])}"
        for key, label in (
            ("areaCodeName", "工作地区"),
            ("degreeName", "学历要求"),
            ("major", "专业要求"),
        )
        if raw.get(key)
    )
    return JDCreate(
        title=plain(raw.get("jobName")),
        company=plain(raw.get("recName")) or None,
        jd_text=f"{metadata}\n\n{body}".strip(),
        source_type="real",
        source_url=link,
        source_name="国家大学生就业服务平台",
        collected_at=collected,
        salary=f"{lower:g}–{upper:g} K CNY/月" if lower is not None else "面议或未披露完整区间",
        salary_min=lower * 1000 if lower is not None else None,
        salary_max=upper * 1000 if upper is not None else None,
        currency="CNY",
        salary_period="month",
    )
