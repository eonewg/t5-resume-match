# T5 AI 简历诊断与岗位匹配系统

本地运行的 AI 求职辅助工具：将简历原文整理为可编辑的结构化数据，与目标岗位进行关键词匹配和能力缺口分析，生成 STAR 优化建议，并对已录入的岗位记录做市场统计。默认 SQLite 开箱即用，AI 能力由 DeepSeek 官方接口驱动。

## 核心功能

- **Resume 结构化** — 粘贴简历原文，自动抽取姓名、教育、技能与经历；字段核对修改后保存为版本，手动确认的字段在重新解析时受保护。
- **JD 管理与匹配** — 录入目标岗位要求，得到关键词匹配分数与可解释的能力缺口。
- **Diagnosis / STAR 优化** — 基于 JD 生成 STAR 改写与定向建议，逐项核实后采用；失败可重试，不自动采用生成内容。
- **Analytics** — 按来源和采集日期筛选，统计已入库 JD 的技能频率、词云、逐岗技能与薪资区间。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.11–3.13、FastAPI、SQLAlchemy 2、Pydantic v2、Uvicorn（[uv](https://docs.astral.sh/uv/getting-started/installation/) 管理依赖） |
| 前端 | 原生 JavaScript ES modules，由 FastAPI 同源托管，无构建步骤 |
| 数据库 | 默认 SQLite；可选 PostgreSQL 17 + pgvector |
| AI | DeepSeek 官方 API（OpenAI Chat Completions 协议） |

## 当前 AI 配置

- Provider：DeepSeek 官方（`https://api.deepseek.com`），模型 `deepseek-v4-flash`
- Resume 与 Diagnosis 共用同一密钥：在 `.env` 中配置 `DEEPSEEK_API_KEY`
- 需要分开时，可用 `T5_RESUME_LLM_API_KEY`、`T5_DIAGNOSIS_API_KEY` 分别覆盖
- 密钥仅保存在本地 `.env`（不提交 Git）；未配置密钥可以启动，AI 功能会返回明确配置错误，不会静默回退到 Mock

## 快速启动

需要 Git、Python 3.11–3.13 和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。

```powershell
git clone https://github.com/eonewg/t5-resume-match.git
cd t5-resume-match
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

复制 `.env.example` 为 `.env` 并填入 `DEEPSEEK_API_KEY=你的密钥`；未配置密钥也能启动，但 AI 功能会返回配置错误。

启动后打开 <http://127.0.0.1:8000/>，默认进入「我的简历」；交互式接口文档在 `/docs`。`Ctrl+C` 停止，`start.ps1 -Port 8001` 可更换端口。

其他系统或手动启动：

```sh
uv sync --locked
uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

默认在 `data/t5.db` 创建 SQLite 数据库，重启保留数据，不自动录入样例。

常用环境变量（完整列表见 `.env.example`）：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `T5_DATABASE_URL` | `sqlite:///data/t5.db` | 数据库连接，PostgreSQL 配置见[数据库文档](docs/postgres.md) |
| `DEEPSEEK_API_KEY` | 空 | Resume + Diagnosis 共用的 DeepSeek 密钥 |
| `T5_RESUME_LLM_API_KEY` | 空 | 可选，覆盖 Resume 模块密钥 |
| `T5_DIAGNOSIS_API_KEY` | 空 | 可选，覆盖 Diagnosis 模块密钥 |

## 项目结构

```
backend/
  core/               配置、数据库、模块加载等公共设施
  modules/            resume / jobs / diagnosis / analytics 业务模块
  api/  schemas/  models/
frontend/             原生 JS 前端页面
scripts/              启动、smoke、数据导入与校验脚本
docs/                 详细文档
tests/  examples/     自动化测试与合成样例
data/                 SQLite 数据库与已归档的 JD / 简历样本（运行时生成）
```

## 测试

保持服务运行，在另一个终端执行：

```powershell
uv run --locked python scripts/smoke.py    # 端到端冒烟：简历 → 岗位 → 匹配 → 诊断 → 读回
uv run --locked pytest -q                  # 单元与集成测试（使用独立临时数据库）
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
node scripts/check_frontend.mjs            # 前端静态检查
```

## 已知限制

- 面向本地单用户使用：没有登录、多用户隔离或面向公网的部署设计
- 默认 SQLite；已有数据不会自动迁移到 PostgreSQL
- AI 生成的结构化结果与优化建议需人工核实后采用
- 语义增强默认关闭

## 文档

- [架构说明](docs/architecture.md) — 分层结构、模块边界与数据库设计
- [API 契约](docs/api-contract.md) — REST 接口定义
- [数据库与 pgvector](docs/postgres.md) — PostgreSQL 启动、迁移与向量查询
- [AI Provider 配置](docs/current-provider.md) — 模型与密钥配置细节
- [验证记录](docs/validation.md)、[验收台账](docs/acceptance.md)
- [团队协作约定](docs/team-rules.md)、[前端接入说明](docs/frontend-integration.md)
