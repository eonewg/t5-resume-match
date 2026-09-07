"""Fixed integration fixtures, deliberately not business algorithms or AI outputs."""

from backend.schemas.contracts import (
    JD,
    AnalysisResult,
    DiagnosisInput,
    DiagnosisResult,
    JDData,
    JDInput,
    MatchResult,
    Resume,
    ResumeData,
    TextInput,
)


class MockResume:
    def parse(self, data: TextInput) -> ResumeData:
        return ResumeData(raw_text=data.raw_text)


class MockJobs:
    def parse(self, data: JDInput) -> JDData:
        return JDData(**data.model_dump())

    def match(self, resume: Resume, jd: JD) -> MatchResult:
        return MatchResult(
            resume_id=resume.id,
            jd_id=jd.id,
            score=0,
            matched_skills=[],
            missing_skills=[],
            gap_analysis=["Mock 占位结果，未执行真实匹配，0 分不代表匹配度。"],
        )


class MockDiagnosis:
    def diagnose(self, data: DiagnosisInput) -> DiagnosisResult:
        return DiagnosisResult(summary="Mock 诊断，未调用 AI。", suggestions=[])


class MockAnalytics:
    def analyze(self, jobs: list[JD]) -> AnalysisResult:
        return AnalysisResult(summary="Mock 分析，未运行市场分析模块。", skills={})
