# T5 AI 简历诊断与岗位匹配系统

A（架构与集成）交付：FastAPI 主程序、公共数据库、v1 数据契约、B/C/D/E 四个模块接口、Mock 集成链路和自动化验证。业务模块尚未交付，目前不提供真实简历解析、匹配算法、AI 建议或市场分析；所有 Mock 输出均可识别。

## 一键运行

文档对应当前查看的分支。若要在公共支持 PR 合入前获取本轮示例、自检和前端壳，请将下面的 clone 命令改为 `git clone --branch feat/core-a https://github.com/eonewg/t5-resume-match.git`；成员随后从这份基线建立各自分支，不在 A 分支提交业务。

需要 Git、Python 3.11–3.13（已验证 3.13.5）和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。首次安装需要联网，不需要数据库服务或 AI 密钥。

```powershell
git clone https://github.com/eonewg/t5-resume-match.git
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

## 验证核心链路

保持服务运行，在另一个终端执行：

```powershell
uv run --locked python scripts/smoke.py
uv run --locked pytest -q
uv run --locked ruff check backend tests scripts
uv run --locked ruff format --check backend tests scripts
```

成员开始开发请先看 [开发与自检指南](docs/member-development.md)：`uv run python -m scripts.check_member B --examples` 可直接跑 B 的接入示例（换成 C/D/E 亦可）；真实模块实现后去掉 `--examples` 自检。公共前端挂载、预览及 UI 分工见 [前端接入说明](docs/frontend-integration.md)。

本轮可复现检查与修改清单见 [开发支持验收记录](docs/dev-support-validation.md)。

smoke 会新建一份演示简历、一个岗位及匹配/诊断记录，然后读回验证。自动化测试使用独立临时数据库，不改演示数据库。

手动操作顺序：`POST /api/v1/resumes/parse` → `POST /api/v1/jobs` → 将返回的两个 ID 传给 `POST /api/v1/workflow` → `GET /api/v1/analytics`。具体输入见 [接口契约](docs/api-contract.md)。`/health` 检查应用和数据库；默认 `/ready` 返回 503，表示真实业务模块尚未全部配置，不代表 Mock 演示无法启动。

## 配置与模块接入

需要修改配置时复制 `.env.example` 为 `.env`；不复制也能启动。环境变量优先于 `.env`。四个 provider 默认 `mock`，替换为成员提供的公开 `module:Class` 即可；类实现 [ports.py](backend/core/ports.py) 中同步接口，构造函数无参数，由模块自行读取其专用配置。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `T5_DATABASE_URL` | `sqlite:///data/t5.db` | 公共数据库；相对路径按项目根目录解析 |
| `T5_RESUME_PROVIDER` | `mock` | B，文本解析 |
| `T5_JOBS_PROVIDER` | `mock` | C，JD 解析与匹配 |
| `T5_DIAGNOSIS_PROVIDER` | `mock` | D，诊断 |
| `T5_ANALYTICS_PROVIDER` | `mock` | E，分析 |

模块详细边界、接入示例和数据库说明见 [架构](docs/architecture.md)。业务成员的请求放入 `docs/integration_requests/`，由 A 实施公共变更。[团队通用约定](docs/team-rules.md) 与分工资料保存在 docs 中；每位成员使用自己的本地 `AGENTS.md`，该文件不纳入版本控制。分支分工及启动任务见 [团队上手说明](docs/team-onboarding.md)。A 按 [验收台账](docs/acceptance.md) 对成员逐个验收并集成，真实业务最终验收与当前 Mock 基线分开记录。

如使用 PostgreSQL，先创建空数据库，执行 `uv sync --locked --extra postgres`，配置 `T5_DATABASE_URL=postgresql+psycopg://...`，再直接执行上述 uvicorn 命令。当前验收使用 SQLite；PostgreSQL 未实机验证，pgvector 暂不引入，待 C 确认向量模型和维度后由 A 增加公共迁移。

## 版本与故障处理

准确版本以 `uv.lock` 为准；当前锁定 FastAPI 0.141.1、SQLAlchemy 2.0.52、Pydantic 2.13.5、Uvicorn 0.52.4，测试使用 pytest 9.1.1。更新依赖应显式 `uv lock` 并重新验证。

- 端口占用：使用 `-Port 8001`，smoke 可传 `http://127.0.0.1:8001`。
- uv 缓存无权限：设置 `$env:UV_CACHE_DIR="$PWD/.verification/uv-cache"` 后重试。
- 模块导入失败：检查 `.env` 的公开模块路径与类名，确认成员代码已集成、依赖已安装；配置错误会在启动时失败，不静默降级为 Mock。
- pytest 临时目录权限不足：可指定 `--basetemp .verification/test-temp`；若执行器仍限制临时目录，需在允许本地文件操作的终端运行。
- 数据库不可用：检查连接配置、目录写权限和服务状态。当前初始化只创建缺失表，不自动升级现有表，不删除旧数据。

`doc/` 为本地原始教学资料，保留但未上传；`.env`、本地数据库和虚拟环境也不进入 Git。
