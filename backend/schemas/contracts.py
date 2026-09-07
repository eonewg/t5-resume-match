"""Public v1 contracts. Business modules import only this module and core.ports."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50000)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class TextInput(Contract):
    raw_text: Text


class ResumeData(Contract):
    name: str | None = None
    education: str = ""
    skills: list[Label] = Field(default_factory=list, max_length=500)
    experience: list[Text] = Field(default_factory=list, max_length=500)
    raw_text: Text


class Resume(ResumeData):
    id: str


class JDInput(Contract):
    title: Label
    company: str | None = None
    jd_text: Text


class JDData(JDInput):
    skills: list[Label] = Field(default_factory=list, max_length=500)


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


class AnalysisResult(Contract):
    summary: Text
    skills: dict[str, int]


class MatchRecord(MatchResult):
    id: str
    is_mock: bool


class DiagnosisRecord(DiagnosisResult, PairInput):
    id: str
    is_mock: bool


class AnalysisResponse(AnalysisResult):
    is_mock: bool


class WorkflowResult(Contract):
    match: MatchRecord
    diagnosis: DiagnosisRecord
