"""Cancellable stdlib HTTPS transport; secrets only travel through private pipes.

A short-lived worker makes the deadline cover DNS and slow/dripping responses,
which urllib's socket inactivity timeout alone cannot bound. No background retry.
"""

import base64
import errno
import json
import socket
import ssl
import subprocess
import sys
import time
from contextvars import ContextVar
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from http.client import HTTPException, HTTPSConnection, IncompleteRead, RemoteDisconnected
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

from .errors import PermanentLLMError, TemporaryLLMError

# Request-local; never attach attempt/deadline to a shared provider instance.
attempt_context = ContextVar("diagnosis_attempt", default=(1, None))
transport_metrics = ContextVar("diagnosis_transport_metrics", default=None)


def retry_after(value):
    try:
        if value is None or len(value) > 128:
            return None
        if value.isdecimal():
            return float(min(int(value), 86400))
        date = parsedate_to_datetime(value)
        if date.tzinfo is None:
            return None
        return max(0, (date - datetime.now(UTC)).total_seconds())
    except (ValueError, TypeError, OverflowError):
        return None


def classify(error, phase="transport"):
    """Whitelist safe codes; never retain an upstream exception, URL or body."""
    code, delay = None, None
    transient = False
    category = "unknown"
    if isinstance(error, HTTPError):
        code = error.code
        delay = retry_after(error.headers.get("Retry-After") if error.headers else None)
        category = (
            "timeout"
            if code == 408
            else "rate_limit"
            if code == 429
            else "auth_error"
            if code in (401, 403)
            else "upstream_5xx"
            if 500 <= code <= 599
            else "request_error"
        )
        # 500 indicates an internal server failure; 501/505/unknown extensions do not
        # establish a transient failure and must not be blindly replayed.
        transient = code in (408, 429, 500, 502, 503, 504)
        phase = "http_status"
        error.close()
    else:
        cause = error.reason if isinstance(error, URLError) else error
        if isinstance(cause, TimeoutError):
            category, transient = "timeout", True
        elif isinstance(cause, ssl.SSLError):
            category, phase = "connection_error", "tls"
        elif isinstance(cause, (RemoteDisconnected, IncompleteRead)):
            category, transient = "connection_error", True
        elif isinstance(cause, HTTPException):
            category, phase = "invalid_output", "response_protocol"
        elif isinstance(cause, OSError):
            category = "connection_error"
            transient = isinstance(cause, (ConnectionError, socket.gaierror)) and (
                not isinstance(cause, socket.gaierror) or cause.errno == socket.EAI_AGAIN
            )
            transient = transient or cause.errno in (
                errno.ECONNRESET,
                errno.ECONNREFUSED,
                errno.ECONNABORTED,
                errno.ETIMEDOUT,
                errno.EAGAIN,
            )
        elif isinstance(error, URLError):
            category = "connection_error"  # Unstructured reason is not proven transient.
    return {
        "category": category,
        "code": code,
        "phase": phase,
        "retry_after": delay,
        "transient": transient,
    }


def raise_failure(info):
    cls = TemporaryLLMError if info["transient"] else PermanentLLMError
    raise cls(
        "诊断服务暂时无法完成请求，请稍后重试"
        if info["transient"]
        else "诊断请求未能完成，请检查服务配置或联系管理员",
        **{k: info[k] for k in ("category", "code", "phase", "retry_after")},
    ) from None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def exchange(payload, emit_phase=lambda value: None, *, opener=None):
    phase = "connect"
    status = None

    def report(value):
        nonlocal phase
        phase = value
        emit_phase(value)

    class Connection(HTTPSConnection):
        def connect(self):
            report("connect")  # Includes DNS, proxy CONNECT and TLS handshake.
            super().connect()
            self.sock.settimeout(payload["read_timeout"])
            report("read")  # Includes sending the bounded body and waiting for headers.

    class Handler(HTTPSHandler):
        def https_open(self, req):
            return self.do_open(Connection, req, context=self._context)

    request = Request(
        payload["url"],
        data=base64.b64decode(payload["body"]),
        headers=payload["headers"],
        method="POST",
    )
    try:
        report("connect")
        with (opener or build_opener(NoRedirect, Handler())).open(
            request, timeout=payload["connect_timeout"]
        ) as response:
            report("read")
            status = getattr(response, "status", 200)
            emit_phase(f"http_status:{status}")
            raw = response.read(262145)
        return {"body": base64.b64encode(raw).decode(), "http_status": status}
    except Exception as error:
        failure = classify(error, phase)
        if failure["code"] is None:
            failure["code"] = status
        return {"error": failure}


def bounded_request(request, settings):
    _, remaining = attempt_context.get()
    budget = min(settings.timeout_seconds, remaining or settings.timeout_seconds)
    payload = {
        "url": request.full_url,
        "headers": dict(request.header_items()),
        "body": base64.b64encode(request.data).decode(),
        "connect_timeout": min(settings.connect_timeout_seconds, budget),
        "read_timeout": min(settings.read_timeout_seconds, budget),
    }
    started = time.monotonic()
    # No shell, secrets in argv, inherited stdout, or upstream stderr logging.
    process = subprocess.Popen(
        [sys.executable, "-m", "backend.modules.diagnosis.transport"],
        cwd=Path(__file__).resolve().parents[3],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    try:
        output, _ = process.communicate(
            json.dumps(payload).encode(), timeout=max(0.001, budget - (time.monotonic() - started))
        )
    except subprocess.TimeoutExpired:
        process.kill()
        output, _ = process.communicate()
        phases = output.splitlines()
        phase = next(
            (p.decode() for p in reversed(phases) if p in (b"connect", b"read")), "startup"
        )
        code = next(
            (
                int(p[12:])
                for p in reversed(phases)
                if p.startswith(b"http_status:") and p[12:].isdigit()
            ),
            None,
        )
        raise TemporaryLLMError(
            "诊断请求等待已达上限，请稍后重试",
            category="timeout",
            code=code,
            phase=phase + "_deadline",
        ) from None
    except BaseException:
        process.kill()
        process.communicate()
        raise
    if process.returncode != 0:
        raise PermanentLLMError("诊断调用进程异常", category="unknown", phase="worker")
    try:
        result = json.loads(output.splitlines()[-1])
        if "error" in result:
            raise_failure(result["error"])
        return base64.b64decode(result["body"]), result["http_status"]
    except (ValueError, KeyError, IndexError):
        raise PermanentLLMError("诊断调用协议异常", category="unknown", phase="worker") from None


if __name__ == "__main__":
    try:
        value = json.loads(sys.stdin.buffer.read(800000))
        result = exchange(value, lambda phase: print(phase, flush=True))
        print(json.dumps(result), flush=True)
    except Exception:
        sys.exit(1)  # Never render an exception that may contain credentials or user text.
