import base64
import errno
import io
import json
import logging
import socket
import ssl
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from http.client import BadStatusLine, IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.request import Request

import pytest
from pydantic import ValidationError

from backend.modules.diagnosis import transport
from backend.modules.diagnosis.client import create_client
from backend.modules.diagnosis.errors import (
    InvalidOutputError,
    PermanentLLMError,
    TemporaryLLMError,
)
from backend.modules.diagnosis.public import DiagnosisService
from tests.diagnosis.test_diagnosis import ScriptedLLM, data, valid
from tests.diagnosis.test_protocols import FixtureTransport, config, response


@pytest.mark.parametrize(
    "error,category,retryable",
    [
        (TimeoutError("PRIVATE"), "timeout", True),
        (URLError(TimeoutError("PRIVATE")), "timeout", True),
        (ConnectionResetError("PRIVATE"), "connection_error", True),
        (URLError(OSError(errno.ECONNREFUSED, "PRIVATE")), "connection_error", True),
        (socket.gaierror(socket.EAI_AGAIN, "PRIVATE"), "connection_error", True),
        (socket.gaierror(socket.EAI_NONAME, "PRIVATE"), "connection_error", False),
        (ssl.SSLCertVerificationError("PRIVATE"), "connection_error", False),
        (BadStatusLine("PRIVATE"), "invalid_output", False),
        (IncompleteRead(b"PRIVATE"), "connection_error", True),
        (URLError("PRIVATE"), "connection_error", False),
        (RuntimeError("PRIVATE"), "unknown", False),
    ],
)
def test_network_taxonomy(error, category, retryable):
    info = transport.classify(error, "read")
    assert info["category"] == category and info["transient"] is retryable
    assert "PRIVATE" not in str(info)


@pytest.mark.parametrize(
    "status", [408, 429, 500, 502, 503, 504, 400, 401, 403, 404, 501, 505, 599, 307]
)
def test_http_retry_and_immediate_stop(status):
    calls, events, sleeps = [], [], []

    class Opener:
        def open(self, request, timeout):
            calls.append(1)
            if len(calls) == 1:
                raise HTTPError("https://PRIVATE", status, "PRIVATE", {}, None)
            return io.BytesIO(json.dumps(response("openai_chat", valid())).encode())

    instance = DiagnosisService(
        create_client(config(), opener=Opener()),
        settings=config(),
        sleep=sleeps.append,
        on_attempt=events.append,
    )
    if status in (408, 429, 500, 502, 503, 504):
        assert instance.diagnose(data()).summary
        assert len(calls) == 2 and sleeps == [1]
        assert events[-1]["status"] == "validated"
    else:
        with pytest.raises(PermanentLLMError):
            instance.diagnose(data())
        assert len(calls) == 1 and not sleeps
    assert events[0]["http_status"] == status
    assert "PRIVATE" not in str(events)


@pytest.mark.parametrize("phase", ["connect", "read"])
def test_phase_specific_timeouts(phase):
    phases = []

    class ReadTimeout(io.BytesIO):
        def read(self, size):
            raise TimeoutError("PRIVATE")

    class Opener:
        def open(self, request, timeout):
            assert timeout == 5
            if phase == "connect":
                raise URLError(TimeoutError("PRIVATE"))
            return ReadTimeout()

    result = transport.exchange(
        {"url": "https://example.test", "headers": {}, "body": "", "connect_timeout": 5},
        phases.append,
        opener=Opener(),
    )
    assert result["error"]["category"] == "timeout"
    assert result["error"]["phase"] == phase
    assert phase in phases
    assert result["error"]["code"] == (200 if phase == "read" else None)


def test_real_handler_switches_socket_timeout_after_connect(monkeypatch):
    observed = []

    class Sock:
        def settimeout(self, value):
            observed.append(value)

    def connect(self):
        assert self.timeout == 5
        self.sock = Sock()

    def do_open(self, connection_type, req, **kwargs):
        connection = connection_type("example.test", timeout=req.timeout)
        connection.connect()
        reply = io.BytesIO(b"{}")
        reply.code, reply.msg = 200, "OK"
        reply.info = lambda: {}
        return reply

    monkeypatch.setattr(transport.HTTPSConnection, "connect", connect)
    monkeypatch.setattr(transport.HTTPSHandler, "do_open", do_open)
    result = transport.exchange(
        {
            "url": "https://example.test",
            "headers": {},
            "body": "",
            "connect_timeout": 5,
            "read_timeout": 40,
        }
    )
    assert base64.b64decode(result["body"]) == b"{}"
    assert observed == [40]


@pytest.mark.parametrize("phase", ["connect", "read"])
def test_deadline_kills_worker_including_dns_and_dripping_response(monkeypatch, phase):
    real_popen, children = subprocess.Popen, []

    def sleeper(command, **kwargs):
        assert "fixture-key" not in str(command)
        child = real_popen(
            [
                sys.executable,
                "-c",
                f"import time; print('{phase}',flush=True); print('http_status:200',flush=True); time.sleep(20)",
            ],
            **kwargs,
        )
        children.append(child)
        return child

    monkeypatch.setattr(transport.subprocess, "Popen", sleeper)
    started = time.monotonic()
    with pytest.raises(TemporaryLLMError) as caught:
        transport.bounded_request(
            Request("https://example.test", data=b"{}"), config(timeout_seconds=0.5)
        )
    assert caught.value.phase == phase + "_deadline"
    assert caught.value.code == 200
    assert time.monotonic() - started < 3
    assert children[0].poll() is not None


@pytest.mark.parametrize("delay,expected_calls", [(None, 2), (3, 2), (6, 1)])
def test_retry_after_never_replays_before_upstream_minimum(delay, expected_calls):
    error = TemporaryLLMError("safe", category="rate_limit", retry_after=delay, code=429)
    client = ScriptedLLM(error, valid())
    sleeps, events = [], []
    instance = DiagnosisService(
        client, settings=config(), sleep=sleeps.append, on_attempt=events.append
    )
    if expected_calls == 1:
        with pytest.raises(TemporaryLLMError):
            instance.diagnose(data())
        assert not sleeps and events[0]["stop_reason"] == "retry_after_exceeds_budget"
    else:
        assert instance.diagnose(data()).summary
        assert sleeps == [delay or 1]
    assert len(client.messages) == expected_calls


def test_retry_after_header_date_invalid_and_large():
    assert transport.retry_after("3") == 3
    assert transport.retry_after("invalid PRIVATE") is None
    assert transport.retry_after("-1") is None
    assert transport.retry_after("9" * 200) is None
    assert transport.retry_after("999999") == 86400
    date = format_datetime(datetime.now(UTC) + timedelta(seconds=4), usegmt=True)
    assert 2 <= transport.retry_after(date) <= 4
    info = transport.classify(HTTPError("PRIVATE", 429, "PRIVATE", {"Retry-After": "3"}, None))
    assert info["retry_after"] == 3


def test_attempt_limit_backoff_and_budget_formula():
    client = ScriptedLLM(*[TemporaryLLMError("safe", category="timeout")] * 5)
    sleeps = []
    settings = config(max_attempts=5)
    assert config().worst_case_seconds == 95
    assert config(retry_after_cap_seconds=0).worst_case_seconds == 91
    assert settings.worst_case_seconds == 95
    with pytest.raises(TemporaryLLMError):
        DiagnosisService(client, settings=settings, sleep=sleeps.append).diagnose(data())
    assert len(client.messages) == 5 and sleeps == [1, 2, 4, 5]


def test_total_budget_clamps_later_attempt_and_stops():
    now, events, budgets = [0], [], []

    class Slow:
        def complete(self, messages):
            _, remaining = transport.attempt_context.get()
            budgets.append(min(45, remaining))
            now[0] += min(45, remaining)
            raise TemporaryLLMError("safe", category="timeout")

    instance = DiagnosisService(
        Slow(),
        settings=config(total_timeout_seconds=60, max_attempts=5),
        clock=lambda: now[0],
        sleep=lambda delay: now.__setitem__(0, now[0] + delay),
        on_attempt=events.append,
    )
    with pytest.raises(TemporaryLLMError):
        instance.diagnose(data())
    assert budgets == [45, 14] and now[0] == 60
    assert events[-1]["stop_reason"] == "total_budget_exhausted"
    assert transport.attempt_context.get() == (1, None)


def test_invalid_output_default_stop_and_separate_opt_in_limit():
    for repairs, count in ((0, 1), (1, 2)):
        client = ScriptedLLM("bad", "bad", valid())
        events = []
        with pytest.raises(InvalidOutputError):
            DiagnosisService(
                client,
                settings=config(output_retries=repairs, max_attempts=5),
                sleep=lambda _: None,
                on_attempt=events.append,
            ).diagnose(data())
        assert len(client.messages) == count
        assert events[-1]["error_category"] == "invalid_output"
        assert events[-1]["phase"] == "output_json"


@pytest.mark.parametrize(
    "raw,phase",
    [(b"bad", "response_json"), (b"{}", "response_envelope"), (b"x" * 262145, "response_size")],
    ids=["invalid-json", "missing-envelope", "oversized"],
)
def test_permanent_envelope_errors_never_use_model_repair(raw, phase):
    opener = FixtureTransport(raw)
    events = []
    with pytest.raises(InvalidOutputError):
        DiagnosisService(
            create_client(config(), opener=opener),
            settings=config(output_retries=1),
            on_attempt=events.append,
        ).diagnose(data())
    assert len(opener.requests) == 1 and events[0]["phase"] == phase


def test_no_secrets_in_errors_or_logs(caplog):
    caplog.set_level(logging.INFO, logger="backend.modules.diagnosis.public")
    opener = FixtureTransport(
        HTTPError("https://PRIVATE-ENDPOINT", 401, "PRIVATE-BODY fixture-key", {}, None)
    )
    events = []
    with pytest.raises(PermanentLLMError) as caught:
        DiagnosisService(
            create_client(config(), opener=opener), settings=config(), on_attempt=events.append
        ).diagnose(data())
    visible = caplog.text + repr(caught.value) + str(vars(caught.value)) + str(events)
    assert all(
        secret not in visible
        for secret in ("PRIVATE", "fixture-key", "Authorization", data().resume_text)
    )
    assert events[0]["error_category"] == "auth_error"
    assert {"vendor", "model", "attempt", "elapsed_seconds", "http_status"} <= events[0].keys()


@pytest.mark.parametrize(
    "options",
    [
        {"connect_timeout_seconds": 16},
        {"read_timeout_seconds": 91},
        {"timeout_seconds": 91},
        {"total_timeout_seconds": 121},
        {"max_attempts": 6},
        {"output_retries": 2},
        {"backoff_seconds": -1},
    ],
)
def test_configured_limits_are_finite(options):
    with pytest.raises(ValidationError):
        config(**options)


def test_legacy_explicit_timeout_preserved():
    assert config(timeout_seconds=30, max_attempts=3).timeout_seconds == 30


def test_unknown_temporary_error_is_not_evidence_for_retry():
    client = ScriptedLLM(TemporaryLLMError("safe"), valid())
    with pytest.raises(TemporaryLLMError):
        DiagnosisService(client, settings=config()).diagnose(data())
    assert len(client.messages) == 1


def test_worker_pipe_success_without_external_network(monkeypatch):
    real_popen = subprocess.Popen
    envelope = base64.b64encode(json.dumps(response("openai_chat", valid())).encode()).decode()
    code = (
        "import sys,json; p=json.loads(sys.stdin.buffer.read()); "
        "assert p['connect_timeout']==5 and p['read_timeout']==40; "
        "assert p['headers']['Authorization']=='Bearer fixture-key'; "
        f"print(json.dumps({{'body':{envelope!r}, 'http_status':200}}))"
    )

    def worker(command, **kwargs):
        assert "fixture-key" not in str(command)
        return real_popen([sys.executable, "-c", code], **kwargs)

    monkeypatch.setattr(transport.subprocess, "Popen", worker)
    events = []
    assert (
        DiagnosisService(create_client(config()), settings=config(), on_attempt=events.append)
        .diagnose(data())
        .summary
    )
    assert events[0]["status"] == "validated" and events[0]["http_status"] == 200


@pytest.mark.parametrize(
    "raw,phase",
    [
        ("not json", "output_json"),
        ("{}", "output_validation"),
    ],
)
def test_business_validation_preserves_http_status(raw, phase):
    events = []
    with pytest.raises(InvalidOutputError):
        DiagnosisService(
            create_client(config(), opener=FixtureTransport(response("openai_chat", raw))),
            settings=config(),
            on_attempt=events.append,
        ).diagnose(data())
    assert events[0]["http_status"] == 200 and events[0]["phase"] == phase


def test_fact_guard_failure_never_uses_opt_in_json_repair():
    document = json.loads(valid())
    document["star_rewrites"][0]["optimized"] = "提升效率 999%"
    client = ScriptedLLM(json.dumps(document), valid())
    events = []
    result = DiagnosisService(
        client, settings=config(output_retries=1), on_attempt=events.append
    ).diagnose(data())
    assert result.summary and not any(s.startswith("【STAR】") for s in result.suggestions)
    assert len(client.messages) == 1 and events[0]["status"] == "validated"
    assert events[0]["fact_guard_number"] == 1 and events[0]["retry"] is False
