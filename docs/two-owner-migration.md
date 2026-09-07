# T5 两人制规则迁移记录

日期：2026-09-07。起始基线：feat/core-a @ e2ece4e。

## 决策与影响

依据用户提供的三份严格版文档，将五个开发角色改为 A/D 两个主要 owner，课程小组组织不变。A 接管 resume、analytics 和质量保障，D 接管 jobs/matching 并保留已集成 diagnosis。验收按模块与 T5 条目进行，最终只通过 feat/core-a → main PR 合并。

本地 AGENTS.md 改为引用共享团队规则、A 职责与需求矩阵，继续遵守现有 Git 忽略约定，不强制上传个人入口。三份输入文档原文保留并纳入共享版本，便于新 clone 使用；没有重写业务接口或 D 的算法。

同步自检工具和 CI：命令以 resume/jobs/diagnosis/analytics 为单位，D 新分支 feat/intelligence-d 同时要求 jobs 和 diagnosis；范围检查允许这两个模块，拒绝公共改动及错误 PR base。历史分支不再用于新交付。旧验收记录保留历史语境，不能冒充严格 T5 已完成。

API 文档区分现有 v1 与待扩展薪资/来源/时间、图表及向量契约。README 修正 diagnosis 已集成的状态，并明确 SQLite 只是演示过渡、PostgreSQL/pgvector 尚待真实验证。

## 验证证据

- uv sync --locked：通过（31 项解析、27 项已安装检查）。
- uv run --locked pytest -q：79 passed，2 项既有依赖弃用 warning。
- uv run --locked ruff check backend tests scripts examples：通过。
- uv run --locked ruff format --check backend tests scripts examples：42 个文件通过。
- node scripts/check_frontend.mjs：24 passed。
- 四模块 check_member --examples：均通过；A 分支 check_scope --ci 与 check_member --ci 通过，diagnosis 明确为 OFFLINE。
- 新增回归覆盖 D 双模块、历史分支拒绝、PR 方向和目录边界。未调用真实 AI。

第一次验证受 Windows 执行权限影响：uv 全局缓存拒绝访问，改为项目 .verification/uv-cache；pytest 临时目录和 Node 子进程受限，在获准的执行环境运行后通过。这些环境错误没有通过删除测试来规避。

## 未完成事项

本次没有新验收或集成成员分支，也未合并 main。历史 diagnosis 已通过的范围保留，真实 Key 联调、超时预算和依赖弃用提示仍按原台账处理。

resume/jobs/analytics 真实业务、严格 T5 全项、真实 PostgreSQL/pgvector、样本与痛点报告、最终浏览器演示及 clean clone / fresh install 仍待对应任务实现和验收。本次代码改动限于开发检查工具及测试，没有把文档目标实现成产品功能。

本次 AI 辅助过程实际包括：读取严格文档与当前代码、识别职责/状态冲突、修订规则和验收清单、调整 CLI/CI、编写迁移回归及执行检查。没有新增业务算法或虚构调研过程。

## 本次文件

本地更新（不提交）：AGENTS.md。

共享提交文件：
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/core.yml`
- `README.md`
- `docs/acceptance.md`
- `docs/api-contract.md`
- `docs/architecture.md`
- `docs/dev-support-validation.md`
- `docs/frontend-integration.md`
- `docs/integration_requests/README.md`
- `docs/member-development.md`
- `docs/roles/A.md`
- `docs/roles/B.md`
- `docs/roles/C.md`
- `docs/roles/D.md`
- `docs/roles/E.md`
- `docs/team-onboarding.md`
- `docs/team-rules.md`
- `docs/validation.md`
- `examples/README.md`
- `scripts/check_member.py`
- `scripts/check_scope.py`
- `scripts/member_specs.py`
- `tests/core/test_member_tools.py`
- `AGENTS_A_T5_STRICT.md`
- `T5_TWO_PERSON_ALLOCATION_STRICT.md`
- `T5_REQUIREMENTS_MATRIX.md`
- `docs/two-owner-migration.md`
