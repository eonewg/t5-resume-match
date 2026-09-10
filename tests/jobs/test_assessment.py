import copy
import json

import pytest
from fastapi.testclient import TestClient

from backend.core.config import Settings
from backend.main import create_app
from backend.modules.jobs import assessment
from backend.modules.jobs.assessment import AssessmentError, AssessmentSettings, assess
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JD, Resume


@pytest.fixture
def pair():
    return (
        Resume(
            id="r",
            name="DO NOT SEND NAME",
            raw_text="REMOVED: Java and invented metrics",
            skills=["熟悉 C++ 和 Linux；未掌握 Java；计划学习 SQL"],
            experience=["使用 C++ 开发网络服务"],
            education="本科",
        ),
        JD(
            id="j",
            title="后端工程师",
            jd_text="熟悉 C++，有网络服务项目经验。",
            skills=["C++", "Linux", "Java", "SQL"],
        ),
    )


@pytest.fixture
def output():
    return {
        "summary": "技能与经历有相关证据，仍需确认掌握深度。",
        "dimensions": [
            {
                "dimension": "skills",
                "applicable": True,
                "score": 80,
                "reason": "有明确技能描述",
                "jd_quotes": ["C++"],
                "resume_quotes": ["熟悉 C++ 和 Linux"],
            },
            {
                "dimension": "experience",
                "applicable": True,
                "score": 60,
                "reason": "有相关项目",
                "jd_quotes": ["有网络服务项目经验"],
                "resume_quotes": ["使用 C++ 开发网络服务"],
            },
            {
                "dimension": "education",
                "applicable": False,
                "score": 0,
                "reason": "岗位无学历要求",
                "jd_quotes": [],
                "resume_quotes": [],
            },
        ],
    }


def envelope(output, finish="stop", refusal=None):
    return json.dumps(
        {
            "choices": [
                {
                    "finish_reason": finish,
                    "message": {
                        "content": json.dumps(output, ensure_ascii=False),
                        "refusal": refusal,
                    },
                }
            ]
        }
    ).encode()


def settings(**kwargs):
    return AssessmentSettings(_env_file=None, api_key="fixture-key", **kwargs)


def test_confirmed_skill_sentences_match_without_archived_or_negative_facts(pair):
    resume, jd = pair
    original = resume.model_dump()
    result = JobsService().match(resume, jd)
    assert result.score == result.keyword_score == 50
    assert result.matched_skills == ["C++", "Linux"]
    assert result.missing_skills == ["Java", "SQL"]
    assert resume.model_dump() == original


def test_weighted_assessment_verifies_quotes_and_omits_identifiers_and_raw(pair, output):
    calls = []

    def send(payload, key, timeout):
        calls.append(payload)
        assert payload["model"] == "deepseek-flash"
        assert payload["thinking"] == {"type": "disabled"}
        content = payload["messages"][1]["content"]
        assert "REMOVED" not in content and "DO NOT SEND NAME" not in content
        assert "raw_text" not in content
        requested_schema = json.loads(payload["messages"][0]["content"].split("字段约束：", 1)[1])
        assert (
            requested_schema["$defs"]["AssessmentDimension"]["properties"]["resume_quotes"][
                "maxItems"
            ]
            == 5
        )
        return envelope(output)

    result = assess(*pair, settings=settings(), send=send)
    assert result.score == round((80 * 50 + 60 * 35) / 85, 2)
    assert len(calls) == 1


def test_surplus_verified_quotes_are_selected_after_validation(pair, output):
    resume, jd = pair
    quotes = [f"完成第 {i} 项课程网络开发练习" for i in range(7)]
    resume = resume.model_copy(update={"experience": quotes})
    output["dimensions"][1]["resume_quotes"] = quotes + quotes[:2]
    result = assess(resume, jd, settings=settings(), send=lambda *_: envelope(output))
    assert result.score == 71.76
    assert result.dimensions[1].resume_quotes == quotes[:5]


@pytest.mark.parametrize("length", [201, 801, 4000])
def test_long_verbatim_quotes_preserve_complete_text_and_reject_changed_words(pair, output, length):
    source = ("Synthetic data analysis evidence includes Python, SQL and reporting. " * 80)[:length]
    resume = pair[0].model_copy(update={"experience": [source]})
    jd = pair[1].model_copy(update={"jd_text": pair[1].jd_text + "\n" + source})
    dim = output["dimensions"][1]
    dim["jd_quotes"] = [source]
    dim["resume_quotes"] = [source]
    result = assess(resume, jd, settings=settings(), send=lambda *_: envelope(output))
    assert result.dimensions[1].jd_quotes == [source]
    assert result.dimensions[1].resume_quotes == [source]
    dim["jd_quotes"] = [source + "invented"]
    with pytest.raises(AssessmentError, match="岗位内容与已保存原文不一致"):
        assess(resume, jd, settings=settings(), send=lambda *_: envelope(output))
    dim["jd_quotes"] = [source]
    dim["resume_quotes"] = [source + "invented"]
    with pytest.raises(AssessmentError, match="简历内容与已保存原文不一致"):
        assess(resume, jd, settings=settings(), send=lambda *_: envelope(output))


def test_schema_diagnostics_exclude_private_values_and_unknown_field_names(pair, output, caplog):
    output["dimensions"][0]["resume_quotes"] = ["PRIVATE QUOTE" * 5000]
    output["PRIVATE FIELD"] = "PRIVATE INPUT"
    with pytest.raises(AssessmentError):
        assess(*pair, settings=settings(), send=lambda *_: envelope(output))
    assert '"type": "string_too_long"' in caplog.text
    assert '"max_length": 60000' in caplog.text
    assert '"unknown"' in caplog.text
    assert "PRIVATE" not in caplog.text


def test_unverified_surplus_quote_cannot_be_hidden_by_selection(pair, output, caplog):
    quotes = [f"完成第 {i} 项课程网络开发练习" for i in range(7)]
    resume = pair[0].model_copy(update={"experience": quotes})
    output["dimensions"][1]["resume_quotes"] = quotes + ["PRIVATE fabricated achievement"]
    with pytest.raises(AssessmentError, match="简历内容与已保存原文不一致"):
        assess(resume, pair[1], settings=settings(), send=lambda *_: envelope(output))
    assert "stage=resume_quote" in caplog.text
    assert "PRIVATE" not in caplog.text and "课程网络开发" not in caplog.text


def test_surplus_jd_quotes_are_all_verified_and_positive_evidence_stays_visible(pair, output):
    resume, jd = pair
    negative = [f"未使用工具{i}" for i in range(6)]
    positive = "使用 C++ 开发网络服务"
    resume = resume.model_copy(update={"experience": [*negative, positive]})
    output["dimensions"][1]["resume_quotes"] = [*negative, positive]
    output["dimensions"][1]["jd_quotes"] = ["C++"] * 7
    result = assess(resume, jd, settings=settings(), send=lambda *_: envelope(output))
    assert result.dimensions[1].resume_quotes[0] == positive
    assert len(result.dimensions[1].resume_quotes) == 5
    assert result.dimensions[1].jd_quotes == ["C++"]
    output["dimensions"][1]["jd_quotes"].append("不存在的岗位要求")
    with pytest.raises(AssessmentError, match="岗位内容与已保存原文不一致"):
        assess(resume, jd, settings=settings(), send=lambda *_: envelope(output))


@pytest.mark.parametrize(
    "failure",
    [
        "quote",
        "jd_quote",
        "no_evidence",
        "duplicate",
        "range",
        "negative",
        "bool_score",
        "length",
        "refusal",
        "filter",
        "intent_evidence",
    ],
)
def test_invalid_or_incomplete_output_fails_without_retry(pair, output, failure):
    output = copy.deepcopy(output)
    dim = output["dimensions"][0]
    if failure == "quote":
        dim["resume_quotes"] = ["编造处理千万请求"]
    elif failure == "jd_quote":
        dim["jd_quotes"] = ["要求博士"]
    elif failure == "no_evidence":
        dim["resume_quotes"] = []
    elif failure == "duplicate":
        output["dimensions"][2]["dimension"] = "skills"
    elif failure == "range":
        dim["score"] = 101
    elif failure == "negative":
        dim["score"] = -1
    elif failure == "bool_score":
        dim["score"] = True
    elif failure == "intent_evidence":
        dim["resume_quotes"] = ["计划学习 SQL"]
    calls = []

    def send(*_):
        calls.append(1)
        return envelope(
            output,
            finish={"length": "length", "filter": "content_filter"}.get(failure, "stop"),
            refusal="refused" if failure == "refusal" else None,
        )

    with pytest.raises(AssessmentError):
        assess(*pair, settings=settings(), send=send)
    assert calls == [1]


def test_assessment_saved_reused_and_failure_preserves_keyword_result(monkeypatch, pair, output):
    calls = []
    resume, jd = pair
    long_quote = (
        "Synthetic network project used C++ to inspect and process requests. " * 20
    ).strip()
    resume = resume.model_copy(update={"experience": [long_quote]})
    jd = jd.model_copy(update={"jd_text": jd.jd_text + "\n" + long_quote})
    output["dimensions"][1]["resume_quotes"] = [long_quote] * 7
    output["dimensions"][1]["jd_quotes"] = [long_quote]

    def send(*_, endpoint):
        assert endpoint == "https://api.deepseek.com/chat/completions"
        calls.append(1)
        if len(calls) == 1:
            raise TimeoutError("PRIVATE_PROVIDER_URL")
        return envelope(output)

    monkeypatch.setattr(assessment, "transport", send)
    monkeypatch.setattr(assessment, "AssessmentSettings", settings)
    config = Settings(
        _env_file=None,
        database_url="sqlite://",
        resume_provider="mock",
        diagnosis_provider="mock",
        analytics_provider="mock",
    )
    with TestClient(create_app(config)) as client:
        saved = client.post("/api/v1/resumes", json=resume.model_dump(exclude={"id"})).json()
        job = client.post("/api/v1/jobs", json=jd.model_dump(exclude={"id"})).json()
        match = client.post(
            "/api/v1/matches", json={"resume_id": saved["id"], "jd_id": job["id"]}
        ).json()
        path = f"/api/v1/matches/{match['id']}"
        failed = client.post(path + "/assessment")
        assert failed.status_code == 502 and "PRIVATE_PROVIDER_URL" not in failed.text
        assert client.get(path).json()["score"] == 50
        assert client.get(path).json()["ai_assessment"] is None
        success = client.post(path + "/assessment")
        assert success.status_code == 200, success.text
        record = success.json()
        assert record["score"] == record["keyword_score"] == 50
        assert record["ai_assessment"]["score"] == 71.76
        assert record["ai_assessment"]["dimensions"][1]["resume_quotes"] == [long_quote]
        assert record["ai_assessment"]["dimensions"][1]["jd_quotes"] == [long_quote]
        assert client.get(path).json() == record
        assert client.post(path + "/assessment").json() == record
        assert len(calls) == 2


def test_missing_config_and_empty_input_do_not_call_network(pair, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("T5_MATCHING_API_KEY", raising=False)

    def unexpected(*_):
        pytest.fail("network must not be called")

    with pytest.raises(AssessmentError, match="密钥"):
        assess(*pair, settings=AssessmentSettings(_env_file=None), send=unexpected)
    empty = pair[0].model_copy(update={"skills": [], "education": "", "experience": []})
    with pytest.raises(AssessmentError, match="补充"):
        assess(empty, pair[1], settings=settings(), send=unexpected)
