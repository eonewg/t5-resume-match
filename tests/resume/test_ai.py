"""Resume AI protocol and fact guard; injected transport never contacts a model."""

import json
from urllib.error import HTTPError, URLError

import pytest

from backend.modules.resume.ai import ResumeAIError, ResumeAIService
from backend.modules.resume.config import ResumeSettings
from backend.schemas.contracts import TextInput

RAW = " 斯特凡诺 (Stefano)\n【教育背景】示例大学 计算机科学与技术 本科\n【专业技能】C / C++、Python、SQL、Node.js\n【项目经历】使用 Python 整理 30 条数据，提升 20%。\n "
FACTS = {
    "name": "斯特凡诺 (Stefano)",
    "education": "示例大学 计算机科学与技术 本科",
    "skills": ["C/C++", "Python", "SQL", "Node.js"],
    "experience": ["使用 Python 整理 30 条数据，提升 20%。"],
}


def settings(**kwargs):
    return ResumeSettings(
        _env_file=None,
        llm_model="test-model",
        llm_api_key="secret-key",
        llm_base_url="https://example.invalid/v1",
        **kwargs,
    )


def response(content=None, style="chat_completions"):
    content = json.dumps(FACTS, ensure_ascii=False) if content is None else content
    envelope = {"choices": [{"finish_reason": "stop", "message": {"content": content}}]}
    if style == "responses":
        envelope = {
            "status": "completed",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": content}]}],
        }
    return json.dumps(envelope).encode()


@pytest.mark.parametrize("style", ["chat_completions", "responses"])
@pytest.mark.parametrize("mode", ["json_schema", "json_object"])
def test_ai_success_protocol_and_raw_fidelity(style, mode):
    calls = []

    def send(endpoint, payload, headers, timeout):
        calls.append(payload)
        assert endpoint.endswith("/responses" if style == "responses" else "/chat/completions")
        assert headers["Authorization"] == "Bearer secret-key"
        assert timeout == 30
        messages = payload["input" if style == "responses" else "messages"]
        assert messages[1]["content"] == RAW
        form = payload["text"]["format"] if style == "responses" else payload["response_format"]
        assert form["type"] == mode
        if mode == "json_schema":
            schema = form if style == "responses" else form["json_schema"]
            assert schema["strict"] is True
            assert set(schema["schema"]["required"]) == set(FACTS)
            assert schema["schema"]["additionalProperties"] is False
        return response(style=style)

    result = ResumeAIService(settings(api_style=style, structured_output=mode), send).parse(
        TextInput(raw_text=RAW)
    )
    assert result.model_dump() == {**FACTS, "raw_text": RAW}
    assert len(calls) == 1


@pytest.mark.parametrize(
    "content",
    ["not json", "```json\n{}\n```", '{"name":null,"name":null}', '{"name":NaN}', "[null]"],
)
def test_invalid_json_is_not_recovered(content):
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), lambda *a: response(content)).parse(TextInput(raw_text=RAW))
    assert exc.value.code in {"json", "schema"}


@pytest.mark.parametrize(
    "change",
    [
        {"raw_text": "rewritten"},
        {"extra": 1},
        {"skills": "Python"},
        {"education": 123},
        {"name": 3},
    ],
)
def test_strict_schema_rejects_extra_and_wrong_types(change):
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), lambda *a: response(json.dumps({**FACTS, **change}))).parse(
            TextInput(raw_text=RAW)
        )
    assert exc.value.code == "schema"


@pytest.mark.parametrize("field", list(FACTS))
def test_all_fields_are_required(field):
    facts = dict(FACTS)
    del facts[field]
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), lambda *a: response(json.dumps(facts))).parse(
            TextInput(raw_text=RAW)
        )
    assert exc.value.code == "schema"


def test_empty_unknown_fields_are_valid():
    facts = {"name": None, "education": "", "skills": [], "experience": []}
    result = ResumeAIService(settings(), lambda *a: response(json.dumps(facts))).parse(
        TextInput(raw_text="未提供个人经历。")
    )
    assert result.model_dump() == {**facts, "raw_text": "未提供个人经历。"}


@pytest.mark.parametrize(
    "change",
    [
        {"name": "虚构姓名"},
        {"skills": ["Rust"]},
        {"experience": ["使用 Python 整理 300 条数据，提升 20%。"]},
        {"experience": ["使用 Python 整理 30 条数据，提升 20 人。"]},
        {"experience": ["管理跨国金融机构客户账户并推动海外销售渠道建设和战略收购整合。"]},
    ],
)
def test_obvious_hallucinations_rejected(change):
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), lambda *a: response(json.dumps({**FACTS, **change}))).parse(
            TextInput(raw_text=RAW)
        )
    assert exc.value.code == "guard"


@pytest.mark.parametrize(
    "status,code",
    [(429, "rate_limit"), (500, "upstream"), (503, "upstream"), (401, "auth"), (403, "auth")],
)
def test_http_errors_are_safe_single_call(status, code):
    calls = []

    def send(*args):
        calls.append(1)
        raise HTTPError("https://secret.invalid/key", status, "private upstream resume", {}, None)

    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), send).parse(TextInput(raw_text=RAW))
    assert exc.value.code == code
    assert len(calls) == 1
    assert "secret" not in str(exc.value) and "private" not in str(exc.value)


@pytest.mark.parametrize("error", [TimeoutError("secret"), URLError(TimeoutError("secret"))])
def test_timeout(error):
    def send(*a):
        raise error

    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), send).parse(TextInput(raw_text=RAW))
    assert exc.value.code == "timeout"
    assert exc.value.status_code == 504


def test_failure_does_not_change_source_and_explicit_retry_calls_again():
    source = TextInput(raw_text=RAW)
    results = iter([b"invalid", response()])
    service = ResumeAIService(settings(), lambda *a: next(results))
    with pytest.raises(ResumeAIError):
        service.parse(source)
    assert source.raw_text == RAW
    assert service.parse(source).raw_text == RAW


@pytest.mark.parametrize(
    "raw,skill",
    [("计划学习 Kubernetes", "Kubernetes"), ("不了解 Rust", "Rust"), ("技能：NoSQL", "SQL")],
)
def test_skill_evidence_respects_negation_and_token_boundaries(raw, skill):
    facts = {"name": None, "education": "", "skills": [skill], "experience": []}
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), lambda *a: response(json.dumps(facts))).parse(
            TextInput(raw_text=raw)
        )
    assert exc.value.code == "guard"


def test_default_is_ai_enabled_and_config_failure_is_explicit():
    config = ResumeSettings(_env_file=None)
    assert config.ai_enabled is True
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(config, lambda *a: pytest.fail("must not call transport")).parse(
            TextInput(raw_text=RAW)
        )
    assert exc.value.code == "config"


def test_disabled_has_no_rule_fallback():
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(ai_enabled=False)).parse(TextInput(raw_text=RAW))
    assert exc.value.code == "disabled"


def test_english_skill_tokens_and_common_symbols():
    raw = "Used Python to clean data. Built APIs using .NET and Power BI. Served 40+人."
    facts = {
        "name": None,
        "education": "",
        "skills": ["Python", ".NET", "Power BI"],
        "experience": ["Served 40+人."],
    }
    result = ResumeAIService(settings(), lambda *a: response(json.dumps(facts))).parse(
        TextInput(raw_text=raw)
    )
    assert result.skills == facts["skills"]


def test_added_unit_after_plus_number_is_rejected():
    raw = "Processed 40+ files."
    facts = {"name": None, "education": "", "skills": [], "experience": ["Processed 40+人."]}
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), lambda *a: response(json.dumps(facts))).parse(
            TextInput(raw_text=raw)
        )
    assert exc.value.code == "guard"


@pytest.mark.parametrize(
    "raw,positive,negative",
    [
        ("Used Python for data analysis. Planning to learn Rust next year.", "Python", "Rust"),
        ("Used Python but no experience with Rust.", "Python", "Rust"),
        ("No experience with Rust but used Python for analysis.", "Python", "Rust"),
        ("Planning to learn Rust but already use Node.js.", "Node.js", "Rust"),
        ("Used .NET. No experience with Rust.", ".NET", "Rust"),
        ("Used Node.js. Have not used Rust.", "Node.js", "Rust"),
    ],
)
def test_english_negation_scope_preserves_existing_skills(raw, positive, negative):
    facts = {"name": None, "education": "", "skills": [positive], "experience": []}
    result = ResumeAIService(settings(), lambda *a: response(json.dumps(facts))).parse(
        TextInput(raw_text=raw)
    )
    assert result.skills == [positive]
    facts["skills"] = [negative]
    with pytest.raises(ResumeAIError) as exc:
        ResumeAIService(settings(), lambda *a: response(json.dumps(facts))).parse(
            TextInput(raw_text=raw)
        )
    assert exc.value.code == "guard"


def test_mixed_fixture_skills_exclude_negative_and_planned_technology():
    from pathlib import Path

    raw = (Path(__file__).parent / "fixtures/ai-evaluation/mixed-representative.txt").read_text(
        encoding="utf-8"
    )
    facts = {
        "name": "Alex Chen / 陈晓",
        "education": "",
        "skills": [
            "Python",
            "SQL",
            "TypeScript",
            "FastAPI",
            "PostgreSQL",
            "Git",
            "Docker",
            "Linux",
            "Redis",
            "Bash",
        ],
        "experience": [],
    }
    service = ResumeAIService(settings(), lambda *a: response(json.dumps(facts)))
    assert service.parse(TextInput(raw_text=raw)).skills == facts["skills"]
    for unsupported in ["Rust", "Kubernetes"]:
        facts["skills"] = [unsupported]
        with pytest.raises(ResumeAIError) as exc:
            service.parse(TextInput(raw_text=raw))
        assert exc.value.code == "guard"
