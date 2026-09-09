import pytest

from backend.modules.jobs.evidence_filter import filter_clauses
from backend.modules.jobs.public import JobsService
from backend.schemas.contracts import JD, JDInput, Resume


@pytest.mark.parametrize(
    "text",
    [
        "不要求 Java",
        "无需 Docker",
        "没有数据库查询优化经验，也从未做过慢查询分析",
        "正在学习 Kubernetes",
        "希望接触 Go",
        "希望未来学习机器学习模型训练，目前没有实践经验",
        "No experience in Java",
        "Currently learning Kubernetes",
        "Java is not required",
    ],
)
def test_non_factual_clauses_excluded(text):
    assert not filter_clauses([text]).kept


def test_negation_before_windows_and_positive_sentence_retained():
    text = "不要求 Java" + "及相关技能" * 60 + "。熟悉 Python。"
    result = JobsService().parse(JDInput(title="岗位", jd_text=text))
    assert result.skills == ["Python"] and result.jd_text == text


def test_benefits_not_job_requirements():
    result = JobsService().parse(
        JDInput(title="岗位", jd_text="公司介绍：提供 Java 培训。要求 SQL。福利：Docker 课程。")
    )
    assert result.skills == ["SQL"]


def test_filtered_resume_cannot_receive_semantic_credit():
    class MustNotCall:
        def encode(self, texts):
            pytest.fail("filtered empty input must not reach embedding")

    resume = Resume(id="r", raw_text="原文", experience=["正在学习 Kubernetes"])
    jd = JD(id="j", title="岗位", jd_text="维护 Kubernetes 集群", skills=["Kubernetes"])
    service = JobsService(embedding=MustNotCall())
    detail = service.match_detail(resume, jd)
    assert detail.final_score == 0 and detail.status == "empty"
    assert detail.result.matched_skills == [] and detail.result.missing_skills == ["Kubernetes"]
    assert "过滤" in detail.result.gap_analysis[-1]


def test_structure_remains_authoritative_and_not_modified():
    resume = Resume(id="r", raw_text="原文", skills=["SQL"], experience=["希望学习 Go"])
    jd = JD(id="j", title="岗位", jd_text="SQL", skills=["SQL"])
    assert JobsService().keyword_match(resume, jd).score == 100
    assert resume.experience == ["希望学习 Go"]
