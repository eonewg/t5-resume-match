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
| 前端 | React 19 + TypeScript + Vite，React Router 导航，构建后由 FastAPI 同源托管 |
| 数据库 | 默认 SQLite；可选 PostgreSQL 17 + pgvector |
| AI | DeepSeek 官方 API（OpenAI Chat Completions 协议） |

## 当前 AI 配置

- Provider：DeepSeek 官方（`https://api.deepseek.com`），模型 `deepseek-v4-flash`
- Resume 与 Diagnosis 共用同一密钥：在 `.env` 中配置 `DEEPSEEK_API_KEY`
- 需要分开时，可用 `T5_RESUME_LLM_API_KEY`、`T5_DIAGNOSIS_API_KEY` 分别覆盖
- 密钥仅保存在本地 `.env`（不提交 Git）；未配置密钥可以启动，AI 功能会返回明确配置错误，不会静默回退到 Mock

## 快速启动

### Windows 便携版

解压整个 `T5-Resume-Match` 文件夹 → 复制 `.env.example` 为 `.env` → 填入 `DEEPSEEK_API_KEY=自己的Key` → 双击 `T5-Resume-Match.exe`。最终用户无需安装 Python、uv、Git 或 Node。保留整个目录（包括 `_internal`），不能只复制 EXE。

启动后仅监听 `127.0.0.1:8000`，成功后自动打开浏览器；关闭控制台或按 Ctrl+C 停止。端口已占用时启动失败，不自动换端口，请先停止占用 8000 的程序后重试。`.env` 从 EXE 同目录读取，SQLite 默认保存在 EXE 同目录的 `data/t5.db`；请解压到可写目录。移动整个文件夹即可保留配置与数据，不使用 LocalAppData。AI 功能需要有效密钥和联网；未配置密钥仍可启动，但 AI 请求会明确失败。`/ready` 表示数据库和四个正式 provider 已加载，不检测密钥有效性。

开发机在 Windows 上运行 `powershell -ExecutionPolicy Bypass -File scripts/build_windows.ps1`，使用已有 uv 安装锁定的构建依赖，以 PyInstaller **onedir** 生成 `dist/T5-Resume-Match/`。构建资源采用白名单，不复制开发机 `.env` 或数据库；构建产物不提交 Git。资源与 EXE 目录分离遵循 [PyInstaller 运行时路径规则](https://pyinstaller.org/en/stable/runtime-information.html)。开发验证可对全新构建运行 `uv run python -m scripts.verify_windows dist/T5-Resume-Match`（需空闲 8000，会创建测试数据库并打开浏览器）；EXE 的 `--check-config` 仅输出配置路径和两模块密钥是否已配置，不输出密钥。实测结果见 [便携版验证记录](docs/windows-portable.md)。

### 源码运行

需要 Git、Python 3.11–3.13、Node.js 22+（含 npm）和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。便携版最终用户无需这些开发工具。

```powershell
git clone https://github.com/eonewg/t5-resume-match.git
cd t5-resume-match
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

复制 `.env.example` 为 `.env` 并填入 `DEEPSEEK_API_KEY=你的密钥`；未配置密钥也能启动，但 AI 功能会返回配置错误。

启动后打开 <http://127.0.0.1:8000/>，默认进入首页工作台，按「我的简历 → 目标岗位 → 匹配分析 → AI 优化」推进；市场洞察在辅助入口。交互式接口文档在 `/docs`。`Ctrl+C` 停止，`start.ps1 -Port 8001` 可更换端口。首次启动自动构建缺失的前端产物；更新前端源码后运行 `start.ps1 -RebuildFrontend`。热更新开发见 [前端接入说明](docs/frontend-integration.md)。

其他系统或手动启动：

```sh
uv sync --locked
npm --prefix frontend ci
npm --prefix frontend run build
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
frontend/             React + TypeScript 页面、状态与 API 客户端；Vite 构建
scripts/              启动、构建便携版、smoke、数据导入与校验脚本
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
node scripts/check_frontend.mjs            # TypeScript、行为和 React 页面测试
npm --prefix frontend run build            # 生产构建（完整 pytest 前先构建）
npm --prefix frontend run test:e2e          # 隔离服务 + 本机 Edge，离线 AI 浏览器验收
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
- [Windows 便携版](docs/windows-portable.md) — 构建与实测验证记录
- [验证记录](docs/validation.md)、[验收台账](docs/acceptance.md)
- [团队协作约定](docs/team-rules.md)、[前端接入说明](docs/frontend-integration.md)
