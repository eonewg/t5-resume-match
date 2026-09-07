class DiagnosisError(RuntimeError):
    """Safe error message: never includes upstream bodies or user input."""


class ConfigurationError(DiagnosisError):
    pass


class TemporaryLLMError(DiagnosisError):
    pass


class PermanentLLMError(DiagnosisError):
    pass


class InvalidOutputError(DiagnosisError):
    pass
