"""Returns the golden sample's counts, not an analytics implementation."""

from backend.schemas.contracts import JD, AnalysisResult
from examples.fixtures import load_cases


class AnalyticsService:
    is_mock = True

    def analyze(self, jobs: list[JD]) -> AnalysisResult:
        if not jobs:
            return AnalysisResult(summary="接入示例：没有岗位数据。", skills={})
        sample = load_cases()
        if [job.skills for job in jobs] != [job["skills"] for job in sample["jobs"]]:
            raise ValueError("This fixture supports only the documented sample jobs")
        return AnalysisResult(
            summary="固定样例统计，不代表就业市场。", skills=sample["analytics_expected"]
        )
