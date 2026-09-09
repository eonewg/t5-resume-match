"""Public v1 contracts. Business modules import only this module and core.ports."""

from datetime import date
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50000)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


def nonblank_original(value: str) -> str:
    if not value.strip():
        raise ValueError("resume text must not be blank")
    return value


# Preserve the pasted resume verbatim; normalizing it would lose the source document.
ResumeText = Annotated[
    str, StringConstraints(min_length=1, max_length=50000), AfterValidator(nonblank_original)
]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class TextInput(Contract):
    raw_text: ResumeText


class ResumeData(Contract):
    name: str | None = None
    education: str = ""
    skills: list[Label] = Field(default_factory=list, max_length=500)
    experience: list[Text] = Field(default_factory=list, max_length=500)
    raw_text: ResumeText


class Resume(ResumeData):
    id: str


class JDInput(Contract):
    title: Label
    company: str | None = None
    jd_text: Text


SourceType = Literal["real", "course", "synthetic", "unknown"]


def source_link(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        raise ValueError("source_url must be a public HTTP(S) link without credentials")
    return value


class JDSource(Contract):
    source_type: SourceType = "unknown"
    source_url: (
        Annotated[str, StringConstraints(max_length=2000), AfterValidator(source_link)] | None
    ) = None
    source_name: Label | None = None
    collected_at: date | None = None


class JDFields(JDSource):
    skills: list[Label] = Field(default_factory=list, max_length=500)
    tools: list[Label] = Field(default_factory=list, max_length=500)
    salary: str | None = Field(default=None, max_length=2000)
    salary_min: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    salary_max: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    currency: Label | None = None
    salary_period: Label | None = None

    @model_validator(mode="after")
    def ordered_salary(self):
        if self.salary_min is not None and self.salary_max is not None:
            if self.salary_min > self.salary_max:
                raise ValueError("salary_min must not exceed salary_max")
        return self

    @model_validator(mode="after")
    def traceable_real_source(self):
        if self.source_type == "real" and (not self.source_url or not self.collected_at):
            raise ValueError("real samples require a source URL and collection date")
        return self


class JDCreate(JDInput, JDFields):
    """HTTP input; optional confirmed metadata never changes the legacy parse port."""


class JDData(JDInput, JDFields):
    pass


class JD(JDData):
    id: str


class PairInput(Contract):
    resume_id: Label
    jd_id: Label


class MatchResult(PairInput):
    score: float = Field(ge=0, le=100, allow_inf_nan=False)
    matched_skills: list[Label]
    missing_skills: list[Label]
    gap_analysis: list[Text]


class DiagnosisInput(Contract):
    resume_text: Text
    jd_text: Text


class DiagnosisResult(Contract):
    summary: Text
    suggestions: list[Text]


class SkillFrequency(Contract):
    skill: Label
    job_count: int = Field(ge=0)
    share_percent: float = Field(ge=0, le=100, allow_inf_nan=False)


class SalaryRange(Contract):
    jd_id: Label
    title: Label
    lower: float = Field(ge=0, allow_inf_nan=False)
    upper: float = Field(ge=0, allow_inf_nan=False)


class SalaryGroup(Contract):
    currency: Label
    period: Label
    sample_size: int = Field(ge=0)
    ranges: list[SalaryRange]


class SalaryCoverage(Contract):
    comparable_count: int = Field(default=0, ge=0)
    missing_range_count: int = Field(default=0, ge=0)
    missing_unit_count: int = Field(default=0, ge=0)


class MarketJob(JDSource):
    jd_id: Label
    title: Label
    company: str | None = None
    skills: list[Label]
    salary: str | None = None
    salary_status: Literal["comparable", "missing_range", "missing_unit"]


class MarketAnalysis(Contract):
    sample_size: int = Field(ge=0)
    company_count: int = Field(ge=0)
    unknown_company_count: int = Field(ge=0)
    source_counts: dict[str, int]
    collected_from: date | None = None
    collected_to: date | None = None
    undated_count: int = Field(ge=0)
    skill_frequency: list[SkillFrequency]
    jobs: list[MarketJob]
    salary_coverage: SalaryCoverage
    salary_groups: list[SalaryGroup]
    observations: list[Text]


class AnalysisScope(Contract):
    source_type: SourceType | None = None
    date_from: date | None = None
    date_to: date | None = None
    available_count: int = Field(ge=0)
    selected_count: int = Field(ge=0)
    mock_count: int = Field(ge=0)
    excluded_mock_count: int = Field(ge=0)


class AnalysisResult(Contract):
    summary: Text
    skills: dict[str, int]
    market: MarketAnalysis | None = None


class MatchRecord(MatchResult):
    id: str
    is_mock: bool


class DiagnosisRecord(DiagnosisResult, PairInput):
    id: str
    is_mock: bool


class AnalysisResponse(AnalysisResult):
    is_mock: bool
    scope: AnalysisScope | None = None


class SampleImportResult(Contract):
    created: int = Field(ge=0)
    existing: int = Field(ge=0)
    jd_ids: list[Label]


class WorkflowResult(Contract):
    match: MatchRecord
    diagnosis: DiagnosisRecord
