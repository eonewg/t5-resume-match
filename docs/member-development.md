# 成员开发与交付

先把接入链路跑通，再实现业务。个人 `AGENTS.md` 仍只留本地，不被本工具改写。

## 从能运行的示例开始

```powershell
uv sync --locked
uv run python -m scripts.check_member B --examples
```

将 B 换为自己的角色。示例代码位于 `examples/providers/`，统一输入和参考输出位于 `examples/fixtures/team.json`。示例不能作为真实模块提交；自检会拒绝把 `is_mock=True` 的类或 examples 路径视为真实实现。

| 角色 | 自己实现的公开入口 | 模块测试目录 |
| --- | --- | --- |
| B | `backend.modules.resume.public:ResumeService` | `tests/resume/` |
| C | `backend.modules.jobs.public:JobsService` | `tests/jobs/` |
| D | `backend.modules.diagnosis.public:DiagnosisService` | `tests/diagnosis/` |
| E | `backend.modules.analytics.public:AnalyticsService` | `tests/analytics/`，系统质量测试可放 `tests/quality/` |

类必须无参构造、同步实例方法；签名见 `backend/core/ports.py`。实例可能被多请求共享，不保存单次请求输入。公开层保持轻薄，内部实现由成员自行组织。

## 提交前的一条自检命令

```powershell
uv run python -m scripts.check_member B
```

真实检查导入自己的公开类，用合成输入检查输出契约及关键保留字段，然后运行自己的测试和公共集成测试。缺少测试目录、没有实际通过的模块用例、仍使用 Mock 或公开调用超时都会失败。命令不会改 `.env`、切分支或写入公共数据库。公开调用默认总时限 45 秒，模块/公共测试分别最多 180 秒；可用 `--timeout` 调整。

自检返回 MEMBER_CHECK_PASS 只表示检查通过；不能代替 A 的代码审查、数据质量或算法效果验收。成员自己的测试应覆盖重复/空输入、边界和失败处理，不能只复制固定样例输出。

**D 默认不构造诊断服务、不调用真实 AI**，只检查公开类/签名和运行成员离线测试。D 应在自己的测试中用替身替换外部客户端，再用 `DiagnosisResult.model_validate(...)` 验证实际业务代码生成的响应。不要在测试中依赖真实密钥。只有明确需要真实调用时才手动使用 `--live`；可能产生费用，CI 不传该参数。

如需定位不同公开路径，可加 `--provider module:Class`，不改变正式入口约定。CLI 失败只给出模块异常类型，避免把可能含密钥的异常内容写入 CI；详细定位使用自己的离线测试。

## 目录与 CI

```powershell
git fetch origin
uv run python -m scripts.check_scope B
uv run ruff check backend tests scripts examples
uv run pytest -q
```

范围检查比较 `origin/feat/core-a...HEAD` 中已提交的变化，不包含未提交内容。成员可改自己的 backend 模块、测试、前端模块及 `docs/integration_requests/<角色>-*.md`；根配置和公共文件需求提交 A。该检查是快速路径检查，不替代敏感信息扫描和人工验收。

CI 对 main、A 和四成员分支的 push 以及 PR 执行 Windows/Ubuntu × Python 3.11/3.13 检查，pytest 会发现整个 `tests/`。成员分支缺少真实入口或测试时 CI 会失败；A/main 尚未集成成员时会明确提示缺失，不冒充完成。成员 PR 必须指向 `feat/core-a`。CI 的 `check_member --ci` 只补公开入口检查，完整 pytest 已在前一步执行。

## 小交付标准

第一轮：能导入的真实公开类、一份合成输入的有效输出、至少一组有意义的模块测试，以及未完成项说明。B/C 优先交这轮，D/E 可并行。

第二轮：补齐角色要求的边界/异常测试；如有 UI，在公共前端壳的模块目录开发，不另建不兼容的工程。

PR 按自动出现的模板填写准确提交 SHA、自检结果、复现步骤、依赖/配置需求和已知限制。公共需求复制 [请求模板](integration_requests/TEMPLATE.md) 为自己的角色文件。A 验收记录在 [台账](acceptance.md)，成员不要预填 PASS。
