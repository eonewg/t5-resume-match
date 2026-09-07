"""Known-input fixtures only. This is not C's matching algorithm."""

from backend.schemas.contracts import JD, JDData, JDInput, MatchResult, Resume
from examples.fixtures import load_cases


class JobsService:
    is_mock = True

    def parse(self, data: JDInput) -> JDData:
        for sample in load_cases()["jobs"]:
            if data.jd_text == sample["jd_text"]:
                return JDData(**data.model_dump(), skills=sample["skills"])
        return JDData(**data.model_dump())

    def match(self, resume: Resume, jd: JD) -> MatchResult:
        for case in load_cases()["match_cases"]:
            if resume.skills == case["resume_skills"] and jd.skills == case["job_skills"]:
                return MatchResult(
                    resume_id=resume.id,
                    jd_id=jd.id,
                    score=case["example_score"],
                    matched_skills=case["matched_skills"],
                    missing_skills=case["missing_skills"],
                    gap_analysis=["固定接入样例，未运行真实匹配算法。"],
                )
        return MatchResult(
            resume_id=resume.id,
            jd_id=jd.id,
            score=0,
            matched_skills=[],
            missing_skills=[],
            gap_analysis=["输入不属于固定样例；示例未计算真实匹配。"],
        )
