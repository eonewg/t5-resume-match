# A / D 开发协作规则

项目由两个开发 owner 负责，课程小组组织按课程要求执行。功能范围见 [T5 需求](../T5_REQUIREMENTS_MATRIX.md)，任务分配见 [两人分工](../T5_TWO_PERSON_ALLOCATION_STRICT.md)。本文件维护公共流程，[A](roles/A.md) 和 [D](roles/D.md) 说明具体职责。个人 AGENTS.md 仅留本地。

## Ownership

| Owner | 责任 | 分支 |
| --- | --- | --- |
| A | public/core、Resume、Analytics、quality/QA、PostgreSQL/pgvector、公共前端、CI、最终集成与交付 | feat/core-a |
| D | Jobs、Matching、Embedding、Diagnosis，以及对应前端与模块测试 | feat/intelligence-d / feat/diagnosis-llm-d |

模块通过 [API 契约](api-contract.md)、公共 Schema 和 ports 交互，不调用其他模块内部实现。D 的匹配与 embedding 代码放在 jobs 模块中，四个公开 provider 保持 resume、jobs、diagnosis、analytics。

A 负责公共数据库、依赖和配置；D 决定向量化对象、模型、维度、距离及评分策略。D 将公共修改需求写入 docs/integration_requests/D-*.md，A 实施并复验。A 可审查全部代码，D 业务问题由 D 修复，公共兼容问题由 A 适配。

## Git 流程

1. 开始前检查仓库、origin、工作区，fetch 后确认本 owner 分支。未知未提交修改不得覆盖、删除、stash 或 reset，停止并说明。
2. A 固定 feat/core-a。D 首次从最新 origin/feat/core-a 创建 feat/intelligence-d；已存在时切换或跟踪现有分支，通过 merge 同步基线，保护已有工作。
3. 独立任务验证后自动 commit/push，只暂存明确文件。禁止 git add .、force push、hard reset、擅自 rebase 已推送提交或推送其他 owner 分支。
4. D PR 允许 feat/intelligence-d 或 feat/diagnosis-llm-d → feat/core-a。两分支使用相同 D 路径限制，均要求 Jobs/Diagnosis 测试；不接受通配分支名。A 验收前重新 fetch，确认 A 分支且工作区干净，记录准确源 SHA 和集成基线。
5. 按 Resume、Jobs/Matching、Diagnosis、Analytics 验收，结果记入 [台账](acceptance.md)。PASS 可集成；BLOCKED 必须修复；ADAPT 需 A 公共适配并复验 PASS。新增提交和需求必须重新检查。
6. 一次集成一个已 PASS 的交付，立即运行相关模块与公共测试。失败停止后续集成，保留诊断证据，不删除功能规避测试。D 业务内部冲突交 D 处理，公共冲突由 A 解决。
7. 最终仅通过 feat/core-a → main PR 合并，满足 [系统门槛](acceptance.md#最终系统门槛)。不直接 push main，不绕过分支保护；合并后核对提交并验证启动和核心链路。

不重写 Git 提交历史。权限、认证或无法安全处理的 Git 状态须明确说明。未要求后台监控时，不自动创建监控任务。

## 验证与证据

每项功能对应 T5 要求，按 Level 1 → Level 2 → Level 3 推进，测试随开发同步。未交付模块可用明确标记的 Mock，不把 Mock 视为真实验收通过。

保留原文和事实；无法解析的字段为空，不虚构经历、技能或量化成果。真实采样、课程样本、合成演示分别标注，个人信息脱敏、密钥不入库。图表注明来源、样本量、时间范围与缺失值口径，不将少量 JD 外推整个市场。

收尾列出分支、commit、文件、模块验收与集成、实际检查和待办。AI 需求拆解、设计、编码、测试、文档及联调过程仅记录实际证据，不编造结果。
