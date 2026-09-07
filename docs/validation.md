# A 交付验收记录

验证日期：2026-09-07。功能提交：`65080e6`，分支 `feat/core-a`。仓库为私有仓库 `eonewg/t5-resume-match`。

## 已验证

- 本地 Windows / Python 3.13.5：13 项 pytest 测试通过；Ruff 检查及 17 个 Python 文件格式检查通过。
- 从 GitHub 全新 clone `feat/core-a`，不复制原工作区虚拟环境；`uv --no-cache sync --locked` 成功重新下载并安装 27 个包，独立运行同样的测试与静态检查全部通过。
- 在全新 clone 中实际调用 `start.ps1 -Port 18765`：`/health` 正常；smoke 创建简历、JD、匹配及诊断并读回一致；分析接口及 OpenAPI 正常。临时 HTTP 服务验证完成后已停止。
- [GitHub CI 34076719814](https://github.com/eonewg/t5-resume-match/actions/runs/34076719814)：Windows / Ubuntu × Python 3.11 / 3.13 共四个 job 全部 success。
- `.env.example` 仅示例值；受跟踪内容未检出常见 GitHub/OpenAI token 或私钥标记。数据库、虚拟环境、原始教学资料不提交。
- 未改动 main 的初始基线、未修改其他成员分支、未进入其他成员业务目录。

## 测试覆盖

完整 Mock 流程及重启持久化；四种无效输入及无原文回显；404 和分页边界；诊断异常时事务回滚；超范围评分和错误关联 ID 拒绝；通过公开模块路径替换四个入口；错误配置启动失败；SQLite 外键实际生效；结构化简历保存及独立匹配、诊断路由。

## 当前限制

B/C/D/E 尚未提供真实实现，本次只验收 A 的可运行架构和 Mock 集成链路。真实业务最终集成、AI 效果、前端编辑器/看板、PostgreSQL 与 pgvector 尚未验收。`/ready` 默认 503 是明确的 Mock 状态；`/health` 正常。pytest 输出两项上游弃用提示，未隐藏。

## 本次修改文件

初始化基线：`.gitignore`、原始 `AGENTS.md`（内容未改写）。

公共代码：

- `backend/main.py`
- `backend/api/routes.py`
- `backend/core/config.py`
- `backend/core/database.py`
- `backend/core/mocks.py`
- `backend/core/ports.py`
- `backend/core/providers.py`
- `backend/core/services.py`
- `backend/models/entities.py`
- `backend/schemas/contracts.py`
- 包入口：`backend/__init__.py`、`backend/api/__init__.py`、`backend/core/__init__.py`、`backend/models/__init__.py`、`backend/schemas/__init__.py`

运行与验证：`.env.example`、`pyproject.toml`、`uv.lock`、`start.ps1`、`scripts/smoke.py`、`tests/core/test_integration.py`、`.github/workflows/core.yml`。

文档：`README.md`、`docs/architecture.md`、`docs/api-contract.md`、`docs/integration_requests/README.md`、`docs/validation.md`。
