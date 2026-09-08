# 开发验证

## 2026-09-08：PR #6 合并提交复验

实测提交 `79e35a9de94245c466e9218ef132643d92c1eb0a`，完整范围及 A/D 后续见 [验收台账](acceptance.md)。本轮开始时 PR 已合并，仅进行合并后复核。

在仓库根 PowerShell 执行 `scripts/local_postgres.ps1 -Action Start`，设置当前进程数据库变量；`UV_CACHE_DIR` 指向 ignored `.verification/uv-cache`。运行 `uv run --locked pytest -q` 得 **247 passed、0 skipped，19.35s**；`uv run --locked python -m scripts.smoke_postgres` 通过。真实数据库为 PostgreSQL 17.6 / pgvector 0.8.1，测试独立 schema 自动清理。首次 Connect 因实例未启动失败，启动后通过；Node 首次因沙箱 spawn EPERM 失败，获准环境重跑后 **33 passed**。

`uv sync --locked`、`ruff check backend tests scripts examples`、`ruff format --check backend tests scripts examples`（78 文件）、准确 PR diff whitespace 检查通过。额外 member 检查为离线模式，有数据库跳过；数据库验收依据为前述设置 PG 变量的全量 247 项，不使用离线跳过结果替代。

真实模型复验使用已缓存的 sentence-transformers 5.1.0 / torch 2.8.0+cpu，模型身份固定为 D 的 MiniLM revision 与 t5-clauses-v2。设置 `HF_HOME=.verification/huggingface`、`HF_HUB_OFFLINE=1`、`PYTHONPATH=.`、`PYTHONUTF8=1`、`OMP_NUM_THREADS=2` 后运行：

```powershell
uv run --offline --locked --with sentence-transformers==5.1.0 --with torch==2.8.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu python tests/jobs/evaluate_pg_holdout.py
```

本轮执行相同脚本，唯一替换为报告目标 `.verification/A-pr6-recheck-holdout.md`，保留 D 原报告。15 配对全部符合断言：10 semantic、5 empty；miss/hit 语义分和最终分相同，hit 无编码；内存/PG 最终分一致。五份 JD 片段数为 121/100/113/88/154，简历为 35/28/0。HTTP preview→保存→JD→缓存→Matching/MatchRecord 通过。hash 变化、版本隔离、fallback/rollback 另由全量中的真实 PG 测试覆盖。

本轮没有重跑浏览器 smoke，也未验收真实 Diagnosis、专用 Resume UI、Analytics 或最终安装演示。D 的既有浏览器证据与本轮亲自运行的检查分开。此批 holdout 是集成回归，没有独立人工金标准，不能解释为生产质量提升。

## 运行检查

从 feat/core-a 使用锁定依赖运行：

```powershell
uv sync --locked
uv run --locked pytest -q
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
node scripts/check_frontend.mjs
```

自检以 resume、jobs、diagnosis、analytics 为参数。带 --examples 时验证共享合成样例；真实模块自检去掉该参数。diagnosis 默认离线，不构造模型客户端。

CI 运行 Windows/Ubuntu × Python 3.11/3.13，D 分支要求 Jobs/Matching 和 Diagnosis 两个模块；A/main 检查当前已存在模块，不能把未实现模块视为 PASS。分支、目录和模块映射统一来自 scripts/member_specs.py。

## 验证边界

现有测试覆盖公共 API、Mock 流程、持久化、关联 ID、事务回滚、provider 契约、前端调用与生命周期、Diagnosis 离线故障处理及 A/D 工作流限制。共享 examples/providers/ 四个示例用于当前模块契约和公共 Mock 演示，不是独立 owner 交付。

PostgreSQL/pgvector 与 Jobs 默认浏览器链路本阶段已独立验证；真实模型质量与延迟、完整 T5 浏览器演示、最终版本的 clean clone / fresh install 仍待后续。模块完整状态见 [验收台账](acceptance.md)。自动测试通过不代表全部系统已完成。

Windows 如遇 uv 缓存访问限制，可设置 UV_CACHE_DIR 为项目 .verification/uv-cache。pytest 临时目录或 Node 子进程权限受限时，需要在允许相应本地操作的执行环境运行，不能通过删测试规避失败。

## 本次结果

### 2026-09-08：Level 1 集成、JD 契约、PostgreSQL/pgvector、独立材料

- 当前分支 feat/core-a。用户明确确认原有未提交 Resume 修改可作为基线并一并提交；修复其 Windows 超长 pytest 参数名（不改变 50001 字符测试输入）及格式问题，93 passed，提交 `c4ef397`。
- PR #5 准确源 `fe3dfbb65ec5fe46852a6fb9ddd0a42adf2c92f5` 相对 `844b89c` 审查：无 A 公共层越界；D 集成请求要求默认导航与 JD 可选字段，旧文档阻塞已经修正。
- 源提交独立 worktree 实测：Python 104 passed、前端 32 passed。合并前 GitHub 8 个检查 SUCCESS，PR 为 MERGEABLE/非 draft。合入 feat/core-a 的准确 merge commit 为 `ebbe251`，未触及 main。
- 默认 Resume/Jobs provider 与 JDCreate 适配后，共 142 项 Python tests 通过（设置 T5_TEST_DATABASE_URL，数据库项无跳过）；包含 D Jobs 28、Diagnosis 44 离线回归。未读取或调用真实模型密钥。
- 前端统一测试 33 passed。Jobs 正式注册并能经普通导航进入；公共 Mock 提示按模块列出，避免把真实关键词结果误标为 Mock。
- 原生 PostgreSQL 17.6（MSVC）+ pgvector 0.8.1（官方源 `778dacf20c07caf904557a88705142631818d8cb`）真实启动于 127.0.0.1:55432；不注册系统服务、不改变系统 PATH。
- `scripts.migrate` 和 `scripts.smoke_postgres` 实际通过扩展、迁移、HNSW、向量写入/查询以及 PostgreSQL Resume → JD → keyword match。DB 测试验证三种距离、重连持久化、隔离、错误输入、维度/外键、回滚、级联和幂等迁移。
- Browser 插件运行时引用缺失的 26.901.51231 目录，本机仅有 26.825.51511，无法连接。读取 Browser 技能并诊断后，使用项目已有风格的独立 Playwright / 无头 Edge 回退验证；不是对用户已登录浏览器的操作。
- `tests/core/jobs-default-smoke.cjs` 在真实 PG/FastAPI 上通过：无 preview 默认导航、Resume 预览后确认编辑/保存、JD 输入解析、33.33% 及 gap、502 恢复、390px 无横向溢出、跨模块选择保留与重复导航不重复请求。简历输入为明确合成 fixture；只验证编辑后保存 API，不声称专用 Resume UI 已交付。
- 独立材料在 `data/holdout/2026-09-08`：5 个新真实 Canonical JD、3 份作者公开的学生时期简历，含来源快照/哈希/固定 Git 版本/MIT 许可与去标识化说明。`scripts.validate_holdout` 通过，未与旧 JD URL/原文重复，不调整 D 词表；尚无独立人工金标准或泛化指标。
- 原有 `scripts.validate_data` 与 jobs/diagnosis 成员自检通过。两个既有 Starlette/httpx/AnyIO 弃用提示仍保留，未降检查标准。
- 变更范围：公共 API/schema/config/注册与提示、数据库/迁移/repository、依赖/CI/启动-smoke-材料脚本、A tests、独立数据、共享说明。D 算法文件无修改，仅其测试显式指定旧 Mock 来源 fixture。
- 本阶段尚未完成：D 独立 tools/薪资自动提取、Embedding/评分、真实 AI 输出质量；A Resume 编辑器 UI/Analytics 与最终系统集成。不提前合 main。
- 补充复验：修正全仓格式后 Ruff check/format、uv sync --locked、git diff --check 通过；CI 模式范围/公共契约自检通过。原生数据库停止/重启后 smoke 再次通过。浏览器测试记录已按准确 ID 清理，本地 PostgreSQL 运行目录保留，供 D 后续使用。

浏览器 smoke 的可复现命令（先在独立测试数据库启动默认配置的 API，默认 8765）：

```powershell
npm install --prefix .verification/browser --no-save --package-lock=false playwright
$env:NODE_PATH = "$PWD/.verification/browser/node_modules"
node tests/core/jobs-default-smoke.cjs
```

需要本机 Edge。脚本使用明确合成 fixture，记录 ID 到 `.verification/jobs-default-records.json`；结束后针对该测试库清理对应记录。截图在 `.verification/jobs-default-desktop.png` 与 `jobs-default-mobile.png`；本轮已查看桌面/手机截图。

### 2026-09-07（三）：第二批简历样本与第二轮人工 baseline

- 新增 `data/resumes/resume-06.json` … `resume-10.json`：5 份 `synthetic` 简历，覆盖数据分析、Java 后端、AI 算法、大数据、数据产品五个方向，质量档位 1 高 / 2 中 / 2 低。全部 `anonymized: true`，无姓名、电话、邮箱、学号，学校与公司泛化；每份 `notes` 写明档位与刻意保留的诊断点。
- 新增 `data/baselines/gap-baseline-round2.json` + `.csv`：5 份核心真实 JD（`jd-real-01/04/05/07/09`）× 5 份新简历 = 25 组人工标注（`reviewer: manual(A)`），档位 low 19 / medium 5 / high 1。第一轮 `gap-baseline.json` 的内容与字段语义未改动，两轮共 40 组同时有效。
- `scripts/validate_data.py`：简历改为按 `data/resumes/resume-*.json` 发现并要求 ≥10 份；新增三项检查（id 与文件名一致、经历或项目至少一条、`raw_text_anonymized` ≥300 字）；baseline 校验改为读取各文件声明的 `core_jd_ids` / `core_resume_ids` 计算网格（组数须等于两者乘积、实际用到的 ID 集合须与声明一致），并校验 pair 字段集合与同名 CSV 的行数、pair_id、reviewer。
- 文档更新：`data/README.md`（目录结构、简历样本构成表、两轮 baseline 规范与失效模式对照样本、数据缺口）、`docs/integration_requests/D-data-handoff.md`（10 份简历、两轮核心 ID、按失效模式列出的验证重点）、`docs/market-pain-points.md`（样本构成、新增 3.2 节第二轮观察、常见问题清单扩至 8 类）。
- `uv run python scripts/validate_data.py`：`OK: 30 JDs (9 real), 10 resumes, 40 baseline pairs across 2 files, docs linked`。
- `uv run --locked pytest -q --ignore=tests/resume`：76 passed，2 项既有 Starlette HTTPX/AnyIO 弃用提示。
- `uv run --locked pytest -q`（全量）：91 passed，4 errors。4 errors 仍全部来自工作区既有未提交的 `tests/resume/test_resume.py`（超长参数化触发 Windows 32767 字符环境变量上限），与本次改动无关，本次未修改该文件。
- `uv run --locked ruff check scripts` 与 `ruff format --check scripts`：通过（6 files already formatted）。全仓 format 仍存在既有未提交文件（`backend/api/routes.py`、`backend/modules/resume/public.py`、`tests/core/test_integration.py`、`tests/resume/test_resume.py`）的格式问题，本次不修改他人未提交文件。
- `node scripts/check_frontend.mjs`：24 passed，fail 0。
- `GITHUB_REF_NAME=feat/core-a uv run python -m scripts.check_scope --ci`：通过（A/main 公共改动由 PR 审查，本项只检查 D 目录边界）。不带 CI 环境变量时该命令取不到分支名会 FAIL，属预期，不代表分支有问题。
- `GITHUB_REF_NAME=feat/core-a uv run python -m scripts.check_member --ci`：`PUBLIC_CONTRACT_CHECK_PASS`，diagnosis 为 OFFLINE。`check_member` 的位置参数是模块名（resume/jobs/diagnosis/analytics），不是角色字母。
- 未修改 Jobs/Matching/Diagnosis 业务代码；本次改动仅涉及 `data/`、`docs/` 与 `scripts/validate_data.py`。
- 数据缺口未消除：真实学生简历仍为 **0 份**（本批全部 synthetic，不得当作真实样本引用），真实大数据方向 JD 仍为 **0 份**，故 resume-09 只能与跨方向真实 JD 配对，其 5 组 low 不能用于评估大数据岗匹配质量。
- 本轮不调用真实 AI，不涉及 PostgreSQL/pgvector 入库与浏览器端验证。

### 2026-09-07（二）：数据资产建设

- 新增 `scripts/validate_data.py`（stdlib 实现）：校验 JSON/CSV 合法、JD/简历必填字段与 source_type 一致性、简历敏感信息扫描（手机/邮箱/证件号）、baseline 引用完整性（5 JD × 3 简历 = 15 组）与新文档本地链接；运行结果：OK（30 JD，9 real）。
- `uv run --locked pytest -q`：91 passed，4 errors。errors 全部位于工作区既有未提交的 `tests/resume/test_resume.py`（超长参数化字符串在 Windows 触发 32767 字符环境变量上限），与本次数据文件无关。
- `uv run --locked ruff check scripts/validate_data.py` 与 format --check：通过。
- 全仓 ruff check/format --check：`backend/api/routes.py`、`backend/modules/resume/public.py`、`tests/core/test_integration.py`、`tests/resume/test_resume.py` 存在未提交工作区改动引入的格式问题，本次不修改他人未提交文件，待该部分工作自行修复后复查。
- `node scripts/check_frontend.mjs`：fail 0。
- 新增数据文件：`data/`（README 规范、jd-real.json、jd-synthetic.json、resumes/resume-01..05.json、baselines/gap-baseline.json+csv、collection/collection-log.md）、`docs/competitor-analysis.md`、`docs/market-pain-points.md`、`docs/integration_requests/D-data-handoff.md`。

### 2026-09-07（一）：feat/core-a 工作区

- uv sync --locked：通过。
- pytest：76 passed，2 项既有 Starlette HTTPX/AnyIO 弃用提示。
- Ruff check：通过；format --check：42 个文件通过。
- 前端检查：24 passed。
- 四模块样例和 A 分支 CLI/CI 模式检查通过（Diagnosis 为 OFFLINE）。
- 当前文件职责扫描、65 个本地 Markdown 链接、git diff --check 通过。
- 当前 A/D 映射、D 双模块要求、未知分支拒绝、PR 方向及目录边界均有回归覆盖。

本轮不调用真实 AI，不执行数据库功能升级或模块集成；上表结果只覆盖自动化开发检查。


## 2026-09-08：A 片段缓存公共适配

基线 e3d1c16；D PR #6 5ce3dea 的片段/注入请求。范围与调用契约见 [交接](integration_requests/A-fragment-vector-handoff.md)。
本地真实 PG 全量 Python 163 passed（无跳过）、前端 33 passed；锁定依赖、Ruff check/format、迁移、PG smoke、scope/member 检查通过。
新增整组片段保存点、hash/空间隔离、重连、并发、级联、迁移升级和请求事务回滚证据；旧向量 API 回归通过。
本地首次沙箱权限失败后在授权正常环境复验，不是业务测试失败。远端 CI 待该提交推送后核实，结果及 SHA 记录于 PR #6 交接评论。
未合并 D PR #6，未处理 embedding/长文档算法，也不代表 T5 最终验收完成。
