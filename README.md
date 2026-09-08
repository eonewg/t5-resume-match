# T5 AI 简历诊断与岗位匹配系统

按 [T5 需求对照表](T5_REQUIREMENTS_MATRIX.md) 和 [两人分工](T5_TWO_PERSON_ALLOCATION_STRICT.md) 开发：A 负责公共平台、resume、analytics、数据库与最终交付；D 负责 jobs/matching、embedding、diagnosis。Resume 结构化编辑器、Jobs 关键词匹配与可选 pgvector 缓存、来源明确的 Analytics 已接入并验证。语义增强默认 off，Diagnosis 新协议交付待 D PR 后统一验收；完整状态见 [验收台账](docs/acceptance.md)。

## 一键运行

下列命令获取当前 A 集成基线；D 从最新 origin/feat/core-a 创建 feat/intelligence-d，具体见 [上手说明](docs/team-onboarding.md)。最终稳定交付仅通过 feat/core-a → main PR 完成。

需要 Git、Python 3.11–3.13（已验证 3.13.5）和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。首次安装需要联网；当前 SQLite/Mock 演示不需要数据库服务或 AI 密钥，最终 PostgreSQL/pgvector 与真实诊断验证需要相应服务和配置。

```powershell
git clone --branch feat/core-a https://github.com/eonewg/t5-resume-match.git
cd t5-resume-match
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

打开 http://127.0.0.1:8000/ 使用公共工作台，可填入合成样例体验流程；交互式接口文档仍在 `/docs`。Ctrl+C 停止，`start.ps1 -Port 8001` 可更换端口。脚本使用 `uv.lock` 安装准确版本，无需激活虚拟环境或安装 Node。工作台无外部资源依赖，安装后可离线使用；Swagger 文档资源需要浏览器联网。

其他系统或手动启动：

```sh
uv sync --locked
uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

默认在项目 `data/t5.db` 创建 SQLite 数据库，重启保留数据；不自动录入样例。当前是本地单用户集成骨架，尚未实现登录、多用户数据隔离或面向互联网的部署。

## 产品主流程

1. 普通导航进入 **简历编辑**（`/#resume`），粘贴原文并解析。姓名、教育、技能和各段经历均可修改；每行一个技能。手动修改或确认的字段会被保护，重解析只自动填充未保护字段，也可逐项主动采用新建议。
2. 勾选核对后保存，系统重新读取并比较全部字段，成功后选择该版本进入 **岗位匹配**。编辑另存新版本，旧版本不变；保存后刷新页面可在历史列表重新载入。页内切换保留草稿，刷新浏览器前应保存。
3. 保存/选择 JD，计算关键词匹配与 gap。缺失技能不从旧原文自动补回；语义增强默认关闭。首页快捷原文诊断另建记录，使用已确认字段时走上述编辑器流程。
4. 进入 **市场分析**（`/#analytics`），按来源和采集日期筛选。可主动导入 5 份已归档真实 JD；导入可重复执行，不增加相同快照数量。技能频率、词云、逐岗技能、薪资区间和来源明细来自已入库记录。

真实快照均来自 Canonical、采集于 2026-09-08，薪资未知；不把福利预算当薪资。薪资区间只有在上下界、币种和周期明确时进入对应组，不混币种、不折算、不以零补未知值。实际五岗位分析见 [样本报告](docs/analytics-sample-analysis.md)。手动 JD 未提供来源时为 unknown，可在“全部来源”或“来源未确认”筛选中查看；带来源的录入契约见 [API](docs/api-contract.md)。

## 验证核心链路

保持服务运行，在另一个终端执行：

```powershell
uv run --locked python scripts/smoke.py
uv run --locked pytest -q
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
node scripts/check_frontend.mjs
```

成员开始开发请先看 [开发与自检指南](docs/member-development.md)：`uv run --locked python -m scripts.check_member resume --examples` 可跑简历接入示例（也可选择 jobs、diagnosis、analytics）；真实模块实现后去掉 `--examples` 自检。公共前端挂载、预览及 UI 分工见 [前端接入说明](docs/frontend-integration.md)。

开发检查与当前验证结果见 [验证记录](docs/validation.md)。

smoke 会新建一份演示简历、一个岗位及匹配/诊断记录，然后读回验证。自动化测试使用独立临时数据库，不改演示数据库。

手动操作顺序：`POST /api/v1/resumes/parse` → `POST /api/v1/jobs` → 将返回的两个 ID 传给 `POST /api/v1/workflow` → `GET /api/v1/analytics`。具体输入见 [接口契约](docs/api-contract.md)。`/health` 检查应用和数据库；默认 `/ready` 返回 503，表示真实业务模块尚未全部配置，不代表 Mock 演示无法启动。

## 配置与模块接入

需要修改配置时复制 `.env.example` 为 `.env`；不复制也能启动。环境变量优先于 `.env`。Resume/Jobs/Analytics 默认使用真实 provider，Diagnosis 仍为 Mock。旧 `.env` 若显式将 Jobs 或 Analytics 设置为 mock，需改为下表正式入口；不会静默覆盖用户配置。类实现 [ports.py](backend/core/ports.py) 中同步接口，构造函数无参数。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `T5_DATABASE_URL` | `sqlite:///data/t5.db` | 公共数据库；相对路径按项目根目录解析 |
| `T5_RESUME_PROVIDER` | `backend.modules.resume.public:ResumeService` | A，保守规则解析，缺失信息留空 |
| `T5_JOBS_PROVIDER` | `backend.modules.jobs.public:JobsService` | D，JD 关键词解析与匹配，正式入口 `/#jobs` |
| `T5_DIAGNOSIS_PROVIDER` | `mock` | D，诊断；真实实现 `backend.modules.diagnosis.public:DiagnosisService` |
| `DEEPSEEK_API_KEY` | 空 | D 专用，启用真实诊断时设置；未设置时诊断明确失败而非降级 Mock |
| `T5_DIAGNOSIS_MODEL` | `deepseek-v4-flash` | D 专用，模型名 |
| `T5_ANALYTICS_PROVIDER` | `backend.modules.analytics.public:AnalyticsService` | A，来源/日期筛选下的技能与薪资样本统计 |

D 真实诊断的完整配置与行为说明见 [D 模块 README](backend/modules/diagnosis/README.md)。

模块详细边界、接入示例和数据库说明见 [架构](docs/architecture.md)。业务成员的请求放入 `docs/integration_requests/`，由 A 实施公共变更。[团队通用约定](docs/team-rules.md) 与分工资料保存在 docs 中；每位成员使用自己的本地 `AGENTS.md`，该文件不纳入版本控制。分支分工及启动任务见 [团队上手说明](docs/team-onboarding.md)。A 按 [验收台账](docs/acceptance.md) 对模块逐项验收并集成，真实业务最终验收与当前 Mock 基线分开记录。

PostgreSQL/pgvector 依赖已进入默认锁定依赖。启动、迁移、原生 Windows / Compose 配置、向量写入与相似度查询见 [数据库与向量契约](docs/postgres.md)。已真实验证 PostgreSQL 17.6 + pgvector 0.8.1，D 固定模型与事务缓存已随 PR #6 集成；可选模型需另外预置，默认不启用。SQLite 演示不会自动转换成 PostgreSQL 数据。

新增 [独立验收材料](data/holdout/2026-09-08/README.md)：5 份真实 JD + 3 份公开学生时期简历，保留来源、版本与许可，独立于 D 词表调整样本；其语言、雇主和时间偏差均明确记录。

## 版本与故障处理

准确版本以 `uv.lock` 为准；当前锁定 FastAPI 0.141.1、SQLAlchemy 2.0.52、Pydantic 2.13.5、Uvicorn 0.52.4，测试使用 pytest 9.1.1。更新依赖应显式 `uv lock` 并重新验证。

- 端口占用：使用 `-Port 8001`，smoke 可传 `http://127.0.0.1:8001`。
- uv 缓存无权限：设置 `$env:UV_CACHE_DIR="$PWD/.verification/uv-cache"` 后重试。
- 模块导入失败：检查 `.env` 的公开模块路径与类名，确认成员代码已集成、依赖已安装；配置错误会在启动时失败，不静默降级为 Mock。
- pytest 临时目录权限不足：可指定 `--basetemp .verification/test-temp`；若执行器仍限制临时目录，需在允许本地文件操作的终端运行。
- 数据库不可用：检查连接配置、目录写权限和服务状态。启动执行带版本记录的非破坏性迁移，也可先运行 `uv run --locked python -m scripts.migrate`；不删除旧数据。

`doc/` 为本地原始教学资料，保留但未上传；`.env`、本地数据库和虚拟环境也不进入 Git。
