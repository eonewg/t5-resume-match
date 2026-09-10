"""Local, masked AI configuration; atomic provider swaps never mutate in-flight services."""

import json
import os
import threading
from copy import copy
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from backend.core.providers import Provider
from backend.modules.diagnosis.config import DiagnosisSettings, secure_url
from backend.modules.diagnosis.public import DiagnosisService
from backend.modules.jobs.assessment import AssessmentSettings
from backend.modules.jobs.public import JobsService
from backend.modules.resume.config import ResumeSettings
from backend.modules.resume.public import ResumeService

Module = Literal["resume", "matching", "diagnosis", "vision"]
MODULES = ("resume", "matching", "diagnosis", "vision")
PROVIDER_KEYS = {
    "resume": "resume",
    "matching": "jobs",
    "diagnosis": "diagnosis",
    "vision": "resume",
}


class ModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    base_url: str = Field(min_length=1, max_length=2048)
    model: str = Field(min_length=1, max_length=200)
    api_style: Literal["chat_completions", "responses"] = "chat_completions"
    api_key: SecretStr | None = Field(default=None, max_length=4096, repr=False)

    @field_validator("base_url")
    @classmethod
    def address(cls, value):
        try:
            return secure_url(value.strip())
        except Exception:
            raise ValueError("需要合法 HTTPS 服务地址") from None

    @field_validator("model")
    @classmethod
    def model_name(cls, value):
        value = value.strip()
        if not value or any(ord(c) < 32 for c in value):
            raise ValueError("需要有效模型名")
        return value

    @field_validator("api_key")
    @classmethod
    def key(cls, value):
        if value is None:
            return None
        secret = value.get_secret_value().strip()
        if any(ord(c) < 32 for c in secret):
            raise ValueError("密钥格式无效")
        return SecretStr(secret) if secret else None


class UpdateConfig(ModelConfig):
    modules: list[Module] = Field(default_factory=list, max_length=4)
    revision: str = Field(min_length=1, max_length=64)
    profile_id: str | None = Field(default=None, max_length=64)
    profile_name: str = Field(default="我的供应商", min_length=1, max_length=80)
    source_module: Module | None = None

    @field_validator("profile_name")
    @classmethod
    def name(cls, value):
        if not value.strip():
            raise ValueError("供应商名称不能为空")
        return value.strip()


class SavedProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    name: str = Field(min_length=1, max_length=80)
    config: ModelConfig


class ResetConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    modules: list[Module] = Field(min_length=1, max_length=4)
    revision: str = Field(min_length=1, max_length=64)


class ProfileAction(ResetConfig):
    profile_id: str = Field(min_length=1, max_length=64)
    modules: list[Module] = Field(default_factory=list, max_length=4)


class RevealKey(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    revision: str = Field(min_length=1, max_length=64)
    module: Module
    profile_id: str | None = Field(default=None, max_length=64)


class SaveExit(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    revision: str = Field(min_length=1, max_length=64)
    update: UpdateConfig | None = None


def effective(module, service):
    if module in {"resume", "vision"} and isinstance(service, ResumeService):
        settings = service.settings or ResumeSettings()
        return settings, {
            "base_url": settings.llm_base_url,
            "model": settings.llm_model,
            "api_style": settings.api_style,
            "api_key": settings.llm_api_key,
        }
    if module == "diagnosis" and isinstance(service, DiagnosisService):
        settings = service.settings
        return settings, {
            "base_url": settings.base_url,
            "model": settings.model,
            "api_style": {"openai_chat": "chat_completions", "openai_responses": "responses"}.get(
                settings.api_style, settings.api_style
            ),
            "api_key": settings.api_key,
        }
    if module == "matching" and isinstance(service, JobsService):
        settings = service.assessment_settings or AssessmentSettings()
        key = settings.api_key if settings.api_key.get_secret_value() else settings.shared_api_key
        return settings, {
            "base_url": settings.base_url,
            "model": settings.model,
            "api_style": "chat_completions",
            "api_key": key,
        }
    return None, {
        "base_url": "",
        "model": "",
        "api_style": "chat_completions",
        "api_key": SecretStr(""),
    }


class AISettings:
    def __init__(self, app, path: Path | None):
        self.app, self.path = app, path
        self.lock = threading.RLock()
        self.revision = uuid4().hex
        self.warning = ""
        self.baseline = dict(app.state.providers)
        self.base_settings = {}
        self.base_values = {}
        for module in MODULES:
            settings, values = effective(
                module, self.baseline[PROVIDER_KEYS[module]].service if path else None
            )
            self.base_settings[module], self.base_values[module] = settings, values
        self.profiles: dict[str, SavedProfile] = {}
        self.assignments: dict[str, str] = {}
        if path and path.exists():
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(raw, dict) or raw.get("version") not in (1, 2):
                    raise ValueError("invalid settings file")
                if raw["version"] == 1:
                    for module, values in raw["modules"].items():
                        identifier = "imported-" + module
                        self.profiles[identifier] = SavedProfile(
                            name=module + " 配置", config=ModelConfig.model_validate(values)
                        )
                        self.assignments[module] = identifier
                else:
                    self.profiles = {
                        identifier: SavedProfile.model_validate(value)
                        for identifier, value in raw["profiles"].items()
                    }
                    self.assignments = raw["assignments"]
                self.validate_assignments(self.profiles, self.assignments)
                app.state.providers = self.providers(
                    self.active_configs(self.profiles, self.assignments)
                )
            except Exception:
                self.profiles, self.assignments = {}, {}
                self.warning = (
                    "本机 AI 配置无法读取或不适用于当前模块，已使用启动配置。请重新保存设置。"
                )

    @staticmethod
    def active_configs(profiles, assignments):
        return {module: profiles[identifier].config for module, identifier in assignments.items()}

    @staticmethod
    def validate_assignments(profiles, assignments):
        if not isinstance(assignments, dict) or any(
            module not in MODULES or identifier not in profiles
            for module, identifier in assignments.items()
        ):
            raise ValueError("invalid assignment")
        for profile in profiles.values():
            if not profile.config.api_key:
                raise ValueError("missing key")
        if (
            "matching" in assignments
            and profiles[assignments["matching"]].config.api_style != "chat_completions"
        ):
            raise ValueError("matching requires Chat Completions")

    @staticmethod
    def masked(values):
        secret = values.get("api_key")
        return {
            "base_url": values["base_url"],
            "model": values["model"],
            "api_style": values["api_style"],
            "api_key_configured": bool(secret and secret.get_secret_value()),
        }

    def view(self):
        with self.lock:
            modules = {}
            for module in MODULES:
                identifier = self.assignments.get(module)
                values = (
                    self.profiles[identifier].config.model_dump()
                    if identifier
                    else self.base_values[module]
                )
                modules[module] = {
                    **self.masked(values),
                    "profile_id": identifier,
                    "source": "custom" if identifier else "startup",
                    "configurable": self.base_settings[module] is not None
                    and self.path is not None,
                }
            profiles = [
                {"id": identifier, "name": profile.name, **self.masked(profile.config.model_dump())}
                for identifier, profile in self.profiles.items()
            ]
            return {
                "revision": self.revision,
                "modules": modules,
                "profiles": profiles,
                "warning": self.warning,
                "can_exit": self.app.state.allow_app_exit,
            }

    def check(self, revision, modules):
        if self.app.state.exiting:
            raise HTTPException(409, "应用正在退出，请重新启动后再修改设置。")
        if revision != self.revision:
            raise HTTPException(409, "设置已在其他页面更新，请重新加载后再保存。")
        if not self.path:
            raise HTTPException(409, "当前实例未启用本机设置保存。")
        if any(self.base_settings[module] is None for module in modules):
            raise HTTPException(409, "所选功能正在使用离线或替代模块，无法在此切换 AI。")

    def resolve(self, data: UpdateConfig):
        self.check(data.revision, data.modules)
        wrong_suffix = "/responses" if data.api_style == "chat_completions" else "/chat/completions"
        if data.base_url.endswith(wrong_suffix):
            raise HTTPException(422, "服务地址的接口路径与所选协议不一致。")
        if "matching" in data.modules and data.api_style != "chat_completions":
            raise HTTPException(422, "匹配分析目前支持 Chat Completions 协议。")
        if data.profile_id and data.profile_id not in self.profiles:
            raise HTTPException(404, "此供应商配置已不存在，请重新加载。")
        old = self.profiles[data.profile_id].config.model_dump() if data.profile_id else None
        # The first profile can explicitly retain a matching startup key for its selected module.
        if old is None and len(data.modules) == 1:
            identifier = self.assignments.get(data.modules[0])
            old = (
                self.profiles[identifier].config.model_dump()
                if identifier
                else self.base_values[data.modules[0]]
            )
        if old is None and data.modules:
            old = self.base_values[data.modules[0]]
        if old is None and data.source_module:
            identifier = self.assignments.get(data.source_module)
            old = (
                self.profiles[identifier].config.model_dump()
                if identifier
                else self.base_values[data.source_module]
            )
        key = data.api_key
        if key is None:
            if old is None or old["base_url"].rstrip("/") != data.base_url:
                raise HTTPException(422, "更换服务地址或新建配置时，请填写对应 API Key。")
            key = old["api_key"]
        if not key or not key.get_secret_value():
            raise HTTPException(422, "请填写 API Key。")
        return ModelConfig(
            base_url=data.base_url, model=data.model, api_style=data.api_style, api_key=key
        )

    def vision_config(self):
        with self.lock:
            identifier = self.assignments.get("vision")
            values = (
                self.profiles[identifier].config.model_dump()
                if identifier
                else self.base_values["vision"]
            )
            if not values.get("api_key") or not values["api_key"].get_secret_value():
                raise HTTPException(409, "请先在模型设置中为截图识别分配支持图片输入的模型。")
            return ModelConfig.model_validate(values).model_copy(deep=True)

    def providers(self, configs):
        providers = dict(self.baseline)
        for module, config in configs.items():
            if self.base_settings[module] is None:
                raise ValueError("provider not configurable")
            if module == "vision":
                continue
            vendor = (
                "deepseek" if urlsplit(config.base_url).hostname == "api.deepseek.com" else "custom"
            )
            original = self.base_settings[module].model_dump()
            if module == "resume":
                settings = ResumeSettings(
                    _env_file=None,
                    **{
                        **original,
                        "ai_enabled": True,
                        "llm_vendor": vendor,
                        "llm_base_url": config.base_url,
                        "llm_model": config.model,
                        "llm_api_key": config.api_key,
                        "api_style": config.api_style,
                    },
                )
                _ = settings.endpoint
                service = ResumeService(settings=settings)
            elif module == "diagnosis":
                settings = DiagnosisSettings(
                    _env_file=None,
                    **{
                        **original,
                        "llm_vendor": vendor,
                        "api_key": config.api_key,
                        "base_url": config.base_url,
                        "model": config.model,
                        "api_style": "openai_chat"
                        if config.api_style == "chat_completions"
                        else "openai_responses",
                        "endpoint_path": None,
                        "reasoning_effort": None,
                        "json_mode": True if config.api_style == "chat_completions" else None,
                    },
                )
                _ = settings.endpoint
                service = DiagnosisService(settings=settings)
            else:
                settings = AssessmentSettings(
                    _env_file=None,
                    **{
                        **original,
                        "base_url": config.base_url,
                        "model": config.model,
                        "api_key": config.api_key,
                    },
                )
                _ = settings.endpoint
                service = copy(self.baseline["jobs"].service)
                service.assessment_settings = settings
            providers[PROVIDER_KEYS[module]] = Provider(service, False)
        return providers

    def commit(self, profiles, assignments):
        try:
            self.validate_assignments(profiles, assignments)
            providers = self.providers(self.active_configs(profiles, assignments))
        except Exception:
            raise HTTPException(422, "模型配置不兼容，请检查地址、模型名和接口协议。") from None
        temp = self.path.with_name(self.path.name + "." + uuid4().hex + ".tmp")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            serializable = {
                identifier: {
                    "name": profile.name,
                    "config": {
                        **profile.config.model_dump(exclude={"api_key"}),
                        "api_key": profile.config.api_key.get_secret_value(),
                    },
                }
                for identifier, profile in profiles.items()
            }
            descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(
                    {"version": 2, "profiles": serializable, "assignments": assignments},
                    stream,
                    ensure_ascii=False,
                )
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, self.path)
        except OSError:
            raise HTTPException(503, "本机配置保存失败，当前 AI 配置未改变。") from None
        finally:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass
        self.profiles, self.assignments = profiles, assignments
        self.app.state.providers = providers
        self.revision = uuid4().hex
        self.warning = ""
        return self.view()

    def save(self, data: UpdateConfig):
        with self.lock:
            config = self.resolve(data)
            identifier = data.profile_id or uuid4().hex
            profiles = {
                **self.profiles,
                identifier: SavedProfile(name=data.profile_name, config=config),
            }
            assignments = {**self.assignments, **{module: identifier for module in data.modules}}
            result = self.commit(profiles, assignments)
            return {**result, "saved_profile_id": identifier}

    def activate(self, data: ProfileAction):
        with self.lock:
            self.check(data.revision, data.modules)
            if not data.modules:
                raise HTTPException(422, "请选择需要切换的 AI 功能。")
            if data.profile_id not in self.profiles:
                raise HTTPException(404, "此供应商配置已不存在，请重新加载。")
            assignments = {
                **self.assignments,
                **{module: data.profile_id for module in data.modules},
            }
            return self.commit(self.profiles, assignments)

    def delete(self, data: ProfileAction):
        with self.lock:
            self.check(data.revision, [])
            if data.profile_id not in self.profiles:
                raise HTTPException(404, "此供应商配置已不存在，请重新加载。")
            if data.profile_id in self.assignments.values():
                raise HTTPException(409, "此配置仍在使用，请先切换对应功能或恢复启动配置。")
            return self.commit(
                {key: value for key, value in self.profiles.items() if key != data.profile_id},
                self.assignments,
            )

    def reset(self, data: ResetConfig):
        with self.lock:
            self.check(data.revision, data.modules)
            return self.commit(
                self.profiles,
                {
                    module: value
                    for module, value in self.assignments.items()
                    if module not in data.modules
                },
            )

    def test(self, data: UpdateConfig):
        if len(data.modules) != 1:
            raise HTTPException(422, "请一次测试一个功能的模型连接。")
        with self.lock:
            config = self.resolve(data)
            self.providers({data.modules[0]: config})
        return test_connection(config)

    def reveal(self, data: RevealKey):
        with self.lock:
            self.check(data.revision, [data.module])
            if data.profile_id:
                if data.profile_id not in self.profiles:
                    raise HTTPException(404, "此供应商配置已不存在，请重新加载。")
                key = self.profiles[data.profile_id].config.api_key
            else:
                key = self.base_values[data.module]["api_key"]
            return {"api_key": key.get_secret_value() if key else ""}

    def close(self):
        # Persisted configuration is retained. Drop this process's references at shutdown.
        with self.lock:
            self.profiles.clear()
            self.assignments.clear()
            self.base_values.clear()
            self.base_settings.clear()
            self.baseline.clear()
            self.app.state.providers = {}

    def save_exit(self, data: SaveExit):
        with self.lock:
            self.check(data.revision, [])
            if not self.app.state.allow_app_exit:
                raise HTTPException(409, "当前运行方式不支持从界面退出。")
            if data.update:
                self.save(data.update)
            else:
                self.commit(self.profiles, self.assignments)
            self.app.state.exiting = True
            return {"exiting": True, "message": "配置已保存，正在关闭 Vitae 服务。"}


def test_connection(config):
    """An explicit user action only. Synthetic probe, no Resume/JD and no response echo."""
    suffix = "/responses" if config.api_style == "responses" else "/chat/completions"
    endpoint = config.base_url if config.base_url.endswith(suffix) else config.base_url + suffix
    if config.api_style == "responses":
        payload = {
            "model": config.model,
            "input": "Connection test. Reply with OK.",
            "max_output_tokens": 64,
        }
    else:
        payload = {
            "model": config.model,
            "messages": [{"role": "user", "content": "Connection test. Reply with OK."}],
            "max_tokens": 64,
        }
        if urlsplit(endpoint).hostname == "api.deepseek.com" and config.model in {
            "deepseek-flash",
            "deepseek-v4-flash",
            "deepseek-v4-pro",
        }:
            payload["thinking"] = {"type": "disabled"}
    try:
        with httpx.Client(timeout=15, follow_redirects=False) as client:
            with client.stream(
                "POST",
                endpoint,
                json=payload,
                headers={"Authorization": "Bearer " + config.api_key.get_secret_value()},
            ) as response:
                if response.status_code in (401, 403):
                    raise HTTPException(422, "鉴权失败，请检查 API Key 及模型访问权限。")
                if response.status_code == 429:
                    raise HTTPException(429, "模型服务限流或额度不足，请稍后检查。")
                response.raise_for_status()
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > 128 * 1024:
                        raise ValueError("probe too large")
                    chunks.append(chunk)
        result = json.loads(b"".join(chunks))
        if config.api_style == "responses":
            valid = result.get("status") == "completed" and any(
                part.get("type") == "output_text" and bool(part.get("text"))
                for item in result.get("output", [])
                if item.get("type") == "message"
                for part in item.get("content", [])
            )
        else:
            choice = result["choices"][0]
            message = choice["message"]
            valid = (
                choice.get("finish_reason") == "stop"
                and not message.get("refusal")
                and isinstance(message.get("content"), str)
                and bool(message["content"].strip())
            )
        if not valid:
            raise ValueError("incomplete response")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(504, "连接测试超时，请检查地址或稍后重试。") from None
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError, AttributeError):
        raise HTTPException(
            502, "未收到完整有效的模型回复，请检查地址、模型名和接口协议。"
        ) from None
    return {
        "ok": True,
        "message": "连接成功，模型已回复。仅验证连接；尚未保存，也未验证业务输出质量。",
    }
