"""Conservative, explicit capability allowlist; unknown models never guessed."""

from urllib.parse import urlsplit

from .errors import ConfigurationError

OPENAI_EFFORTS = {
    "gpt-5.2": {"none", "low", "medium", "high", "xhigh"},
    "gpt-5": {"minimal", "low", "medium", "high"},
}
CLAUDE_EFFORTS = {
    "claude-sonnet-4-6": {"none", "low", "medium", "high"},
    "claude-opus-4-6": {"none", "low", "medium", "high", "max"},
}


def reasoning(settings):
    """Return semantic policy; each wire adapter translates it separately."""
    vendor, model, effort = settings.llm_vendor, settings.model, settings.reasoning_effort
    host = urlsplit(settings.endpoint).hostname
    if (
        vendor == "deepseek"
        and model in {"deepseek-v4-flash", "deepseek-v4-pro"}
        and host == "api.deepseek.com"
    ):
        effort = effort or "none"  # Preserve legacy non-thinking behavior.
        allowed = {"none", "low", "high", "max"}
    elif vendor == "openai" and host == "api.openai.com":
        allowed = (
            OPENAI_EFFORTS.get(model, set())
            if settings.api_style != "anthropic_messages"
            else set()
        )
    elif (
        vendor == "anthropic"
        and host == "api.anthropic.com"
        and settings.api_style == "anthropic_messages"
    ):
        allowed = CLAUDE_EFFORTS.get(model, set())
    elif (
        vendor == "qwen"
        and model == "qwen-plus"
        and host in {"dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"}
        and settings.api_style == "openai_chat"
    ):
        allowed = {"none"}
    else:
        allowed = set()
    if effort is not None and effort not in allowed:
        raise ConfigurationError(
            "此供应商/协议/模型未确认支持所配置的 reasoning effort；请移除或选择支持档位"
        )
    return effort
