import json

import pytest

from backend.modules.diagnosis.errors import FactGuardError
from backend.modules.diagnosis.schema import parse_detail
from tests.diagnosis.test_diagnosis import ScriptedLLM, data, service, valid


def output(original, optimized):
    document = json.loads(valid(original))
    document["star_rewrites"] = [
        {"original": original, "optimized": optimized, "reason": "调整表达"}
    ]
    return json.dumps(document, ensure_ascii=False)


def test_original_surrounding_whitespace_is_already_accepted():
    detail = parse_detail(
        output(" \n使用 Python 清洗数据\n ", "使用 Python 清洗数据"), "使用 Python 清洗数据"
    )
    assert detail.star_rewrites[0].original == "使用 Python 清洗数据"


@pytest.mark.parametrize(
    "quoted,source,line_endings,whitespace",
    [
        ("使用 Python\n清洗数据", "使用 Python\r\n清洗数据", True, True),
        ("使用 Python 清洗数据", "使用 Python\n清洗数据", False, True),
        ("使用 Python 开发接口", "使用 Python 清洗数据", False, False),
    ],
)
def test_original_failure_diagnostics_do_not_relax_exact_match(
    quoted, source, line_endings, whitespace
):
    with pytest.raises(FactGuardError) as caught:
        parse_detail(output(quoted, "按原经历整理表达"), source)
    metadata = caught.value.metadata()
    assert metadata["guard_reason"] == "original_not_in_resume"
    assert metadata["line_endings_only"] is line_endings
    assert metadata["whitespace_only"] is whitespace
    assert quoted not in str(metadata) and source not in str(metadata)


def test_numbers_from_other_project_must_not_migrate_into_this_star():
    original = "甲项目处理 10 条记录"
    with pytest.raises(FactGuardError) as caught:
        parse_detail(
            output(original, "甲项目处理 500 条记录"), original + "\n乙项目处理 500 条记录"
        )
    assert caught.value.metadata()["guard_reason"] == "unsupported_number"
    assert caught.value.metadata()["numbers_elsewhere_in_resume"] is True
    assert caught.value.metadata()["unsupported_number_count"] == 1
    assert "500" not in str(caught.value.metadata())


def test_same_original_numbers_and_missing_information_pass():
    source = "处理 120 条记录，效率提升 20%"
    result = parse_detail(
        output(source, "行动：处理 120 条记录。结果：效率提升 20%。【待补充：具体背景】"), source
    )
    assert len(result.star_rewrites) == 1


@pytest.mark.parametrize(
    "original,optimized,reason",
    [
        ("不在输入中的原文", "整理数据", "original_not_in_resume"),
        ("使用 Python 清洗数据", "处理 999 条记录", "unsupported_number"),
    ],
)
def test_service_preserves_specific_reason_without_retry(original, optimized, reason):
    client = ScriptedLLM(output(original, optimized))
    events = []
    instance = service(client, output_retries=1)
    instance.on_attempt = events.append
    with pytest.raises(FactGuardError) as caught:
        instance.diagnose(data())
    assert caught.value.metadata()["guard_reason"] == reason
    assert events[0]["guard_reason"] == reason
    assert events[0]["phase"] == "fact_guard"
    assert len(client.messages) == 1
