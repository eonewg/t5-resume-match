"""Copy the class shape, then replace fixed fixtures with B's implementation."""

from backend.schemas.contracts import ResumeData, TextInput
from examples.fixtures import load_cases


class ResumeService:
    is_mock = True  # Keep this true until a real implementation replaces the fixture.

    def parse(self, data: TextInput) -> ResumeData:
        sample = load_cases()["resume"]
        if data.raw_text == sample["raw_text"]:
            return ResumeData(**{key: value for key, value in sample.items() if key != "id"})
        return ResumeData(raw_text=data.raw_text)
