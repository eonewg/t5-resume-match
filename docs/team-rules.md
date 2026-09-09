# 团队维护协作规则

项目由两个开发 owner 负责，课程小组组织按课程要求执行。功能范围见 [T5 需求](../T5_REQUIREMENTS_MATRIX.md)，任务分配见 [两人分工](../T5_TWO_PERSON_ALLOCATION_STRICT.md)。本文件维护公共流程，[A](roles/A.md) 和 [D](roles/D.md) 说明具体职责。个人 AGENTS.md 仅留本地。

PR #9 已合入 main，当前进入交付后维护阶段。main 是唯一集成基线，不恢复已删除的开发期分支。

## Ownership

| Owner | 责任 | 当前分支 |
| --- | --- | --- |
| A | public/core、Resume、Analytics、quality/QA、PostgreSQL/pgvector、公共前端、CI、最终集成与交付 | 从 main 创建维护分支 |
| D | Jobs、Matching、Embedding、Diagnosis，以及对应前端与模块测试 | 从 main 创建维护分支 |

模块通过 [API 契约](api-contract.md)、公共 Schema 和 ports 交互，不调用其他模块内部实现。D 的匹配与 embedding 代码放在 jobs 模块中，四个公开 provider 保持 resume、jobs、diagnosis、analytics。

A 负责公共数据库、依赖和配置；D 决定向量化对象、模型、维度、距离及评分策略。D 将公共修改需求写入 docs/integration_requests/D-*.md，A 实施并复验。A 可审查全部代码，D 业务问题由 D 修复，公共兼容问题由 A 适配。

## Git 流程

1. 开始前检查仓库、origin、工作区，fetch 后确认基线；保护已有修改，不覆盖未知内容。
2. 从最新 main 创建维护分支。允许 `feat/*`、`fix/*`、`chore/*`、`docs/*`、`test/*`、`refactor/*`，不要求 `-a` / `-d` 后缀；分支名须符合 Git ref 语法。PR 目标为 main。
3. 独立任务验证后只暂存明确文件并 commit/push；不重写已推送历史、不使用 force push 或 hard reset。合并由明确授权及仓库保护规则决定，不自动 merge main。
4. main 和上述维护分支的 push、所有 PR 均运行 CI。`check_scope --ci` 校验分支/目标，并扫描当前全部 Git 跟踪文件：禁止 `.env`、`__pycache__`、`.pyc`、`.db` 和超过 5 MiB 的文件。未跟踪本地文件不属于交付扫描；该检查不替代完整密钥扫描。
5. CI 不按 A/D owner 限制现代 PR 路径；始终运行四模块入口/测试存在性检查、完整 pytest、Ruff、前端与 PostgreSQL 检查。Resume/Diagnosis 契约探测保持离线，不调用付费模型。
6. A/D 模块职责继续用于协作与审查。本地可显式运行 `python -m scripts.check_scope D --base origin/main` 做历史 D 目录自检；`--base` 可指定已有历史 ref，不依赖或恢复旧远程分支。该模式不是维护 PR 的强制 gate。
7. 按变更涉及的模块提供准确提交、测试与实际业务效果证据；保留失败和未验证边界，不删除测试规避失败。历史系统验收记录保留当时事实。

不重写 Git 提交历史。权限、认证或无法安全处理的 Git 状态须明确说明。未要求后台监控时，不自动创建监控任务。

## 验证与证据

每项功能对应 T5 要求，按 Level 1 → Level 2 → Level 3 推进，测试随开发同步。未交付模块可用明确标记的 Mock，不把 Mock 视为真实验收通过。

保留原文和事实；无法解析的字段为空，不虚构经历、技能或量化成果。真实采样、课程样本、合成演示分别标注，个人信息脱敏、密钥不入库。图表注明来源、样本量、时间范围与缺失值口径，不将少量 JD 外推整个市场。

收尾列出分支、commit、文件、模块验收与集成、实际检查和待办。AI 需求拆解、设计、编码、测试、文档及联调过程仅记录实际证据，不编造结果。

## 历史 D UI 专项（2026-09-08 授权）

以下为开发期约束留档，仅供本地 legacy scope 自检参考；当前 PR 流程以上述维护规则为准。

`feat/ui-refresh-d` 从最新 `origin/feat/core-a` 创建，PR 只指向 A。仅允许 `frontend/**`、`docs/ui/**/*.md`、`docs/frontend-integration.md`、`docs/integration_requests/D-ui-refresh.md`。其他前端设计文档先放入 `docs/ui/`；此限制不会把整个 docs 目录开放。

禁止改 backend、数据库、Matching/Diagnosis 算法、公共 API 契约、CI 或权限脚本。前端调用保持现有契约，不通过前端复制/替换后端评分算法。CI 路径检查不能判断文档语义，A 审查时仍核对设计相关性和行为边界。保留旧 D 业务分支权限；新 UI 分支不会继承业务文件写权限。

CI 继续执行完整 pytest、前端检查及四模块公开契约检查（Diagnosis 离线）；本地 `python -m scripts.check_scope D` 自动按当前分支应用规则。A 在 UI 重构期间避免修改 frontend。收到 UI PR 后检查准确 SHA、范围、交互与回归，再集成；最后统一 fresh install。本轮只推 A，不合 main。
