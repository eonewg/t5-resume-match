import json

import pytest

from backend.modules.diagnosis.errors import InvalidOutputError
from backend.modules.diagnosis.schema import FILTER_WARNING, DiagnosisDetail, parse_detail
from tests.diagnosis.test_diagnosis import ScriptedLLM, data, service, valid


def star(original, optimized=None):
    return {"original": original, "optimized": optimized or original, "reason": "调整表达"}


@pytest.mark.parametrize(
    "bad,reason",
    [
        (star("不存在的原文"), "fact_guard_original"),
        (star("使用 Python 清洗数据", "处理 999 条记录"), "fact_guard_number"),
        (star("使用 Python\n清洗数据"), "fact_guard_original"),
    ],
)
def test_mixed_stars_keep_only_valid_and_never_retry(bad, reason, caplog):
    document = json.loads(valid())
    good = star(data().resume_text)
    document["star_rewrites"] = [bad, good]
    client = ScriptedLLM(json.dumps(document))
    instance = service(client, max_attempts=3, output_retries=1)
    events = []
    instance.on_attempt = events.append
    with caplog.at_level("INFO"):
        result = instance.diagnose(data())
    assert len(client.messages) == 1
    assert sum(s.startswith("【STAR】") for s in result.suggestions) == 1
    assert "999" not in str(result) and "不存在的原文" not in str(result)
    assert events[0][reason] == 1
    assert events[0]["status"] == "validated" and events[0]["error_category"] is None
    assert events[0]["retry"] is False
    assert data().resume_text not in caplog.text and "999" not in caplog.text
    assert any(FILTER_WARNING in s for s in result.suggestions)


def test_all_invalid_preserves_every_other_field_and_counts():
    document = json.loads(valid())
    document["star_rewrites"] = [star("不存在的原文"), star(data().resume_text, "新增 500 条")]
    counts = {}
    result = parse_detail(json.dumps(document), data().resume_text, on_filtered=counts.update)
    assert result.star_rewrites == []
    assert counts == {"fact_guard_original": 1, "fact_guard_number": 1}
    for field in ("summary", "jd_targeted_suggestions", "keywords_to_strengthen"):
        assert getattr(result, field) == document[field]
    assert result.risks == document["risks"] + [FILTER_WARNING]
    DiagnosisDetail.model_validate(result.model_dump())


@pytest.mark.parametrize("rewrites", [[], [star("处理 120 条记录，效率提升 20%")]])
def test_valid_response_is_unchanged(rewrites):
    document = json.loads(valid())
    document["star_rewrites"] = rewrites
    counts = {}
    result = parse_detail(
        json.dumps(document), "处理 120 条记录，效率提升 20%", on_filtered=counts.update
    )
    assert result.model_dump() == document and counts == {}


@pytest.mark.parametrize(
    "quoted,source",
    [
        ("使用 Python\n清洗数据", "使用 Python\r\n清洗数据"),
        ("使用 Python 清洗数据", "使用 Python\n清洗数据"),
    ],
)
def test_no_whitespace_normalization(quoted, source):
    document = json.loads(valid())
    document["star_rewrites"] = [star(quoted)]
    assert parse_detail(json.dumps(document), source).star_rewrites == []


def test_numbers_from_other_project_stay_forbidden():
    document = json.loads(valid())
    document["star_rewrites"] = [star("甲项目处理 10 条记录", "甲项目处理 500 条记录")]
    result = parse_detail(json.dumps(document), "甲项目处理 10 条记录\n乙项目处理 500 条记录")
    assert result.star_rewrites == []


@pytest.mark.parametrize("risks", [["核实事实"] * 10, [FILTER_WARNING]])
def test_notice_never_drops_risks_exceeds_schema_or_duplicates(risks):
    document = json.loads(valid())
    document.update(star_rewrites=[star("不存在的原文")], risks=risks)
    result = parse_detail(json.dumps(document), data().resume_text)
    assert result.risks == risks
    DiagnosisDetail.model_validate(result.model_dump())


@pytest.mark.parametrize(
    "bad",
    [
        {"original": "不存在的原文", "optimized": "内容"},
        {"original": 42, "optimized": "内容", "reason": "理由"},
    ],
)
def test_schema_failure_precedes_any_filtering(bad):
    document = json.loads(valid())
    document["star_rewrites"] = [star("不存在的原文"), bad]
    counts = {}
    with pytest.raises(InvalidOutputError):
        parse_detail(json.dumps(document), data().resume_text, on_filtered=counts.update)
    assert counts == {}


def test_surrounding_whitespace_behavior_is_unchanged():
    document = json.loads(valid())
    document["star_rewrites"] = [star(" \n使用 Python 清洗数据\n ")]
    result = parse_detail(json.dumps(document), data().resume_text)
    assert result.star_rewrites[0].original == data().resume_text
