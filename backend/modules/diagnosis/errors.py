class DiagnosisError(RuntimeError):
    """Safe error message: never includes upstream bodies or user input."""

    category = "unknown"
    retryable = False

    def __init__(self, message, *, category=None, code=None, phase=None, retry_after=None):
        super().__init__(message)
        self.category = category or type(self).category
        self.code = code
        self.phase = phase
        self.retry_after = retry_after

    def metadata(self):
        return {"error_category": self.category, "http_status": self.code, "phase": self.phase}


class ConfigurationError(DiagnosisError):
    category = "request_error"


class TemporaryLLMError(DiagnosisError):
    retryable = True


class PermanentLLMError(DiagnosisError):
    pass


class InvalidOutputError(DiagnosisError):
    category = "invalid_output"
