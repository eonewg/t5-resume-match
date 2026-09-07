# 团队通用协作约定

## 规则来源与分工

课程正式小组组织保持不变，代码由 A/D 两名主要 owner 维护。需求依据 [T5 对照表](../T5_REQUIREMENTS_MATRIX.md)，职责依据 [两人分工](../T5_TWO_PERSON_ALLOCATION_STRICT.md)。本文件统一维护协作流程；[A](roles/A.md)、[D](roles/D.md) 补充职责，B/C/E 文档仅作历史记录。个人 `AGENTS.md` 留在本地，已被 Git 忽略。

- A：公共架构、配置、数据库、Schema、路由、前端壳、resume、analytics、质量保障、验收及最终集成。
- D：jobs（JD 解析与匹配）、diagnosis 及对应前端和测试。
- 模块通过 [API 契约](api-contract.md)、`backend/schemas/contracts.py`、`backend/core/ports.py` 交互，不依赖其他模块内部实现。
- D 对公共字段、根依赖、API、向量维度或索引的需求写入 `docs/integration_requests/D-*.md`，由 A 实施。A 不重写 D 业务算法；业务问题交 D 修复，公共兼容由 A 适配。
- 缺少模块时可用明确标记的 Mock 继续开发，不能记为真实完成。新增功能必须对应 T5；测试随开发进行，不推迟到最后。

## Git 与集成

1. 开始前检查仓库、origin 和工作区，fetch 后确认本角色分支。未知修改不得覆盖、删除、stash 或 reset；本次明确提供的输入应保留。
2. A 固定 `feat/core-a`；D 首次从最新 `origin/feat/core-a` 创建 `feat/intelligence-d`，已有分支保留历史并按需 merge 同步 A。`feat/diagnosis-d` 已完成历史交付，不再承载新任务；不删除历史分支或改写历史记录。
3. 独立任务验证后由 Agent 自动 commit/push，只暂存明确文件。禁止 `git add .`、force push、hard reset、未经授权 rebase 已推送历史及推送他人分支。
4. D 仅通过 `feat/intelligence-d -> feat/core-a` PR 交付。A 验收前重新 fetch，确认 A 分支且工作区干净；记录准确源 SHA、A 基线、变化范围和测试证据。
5. 按 resume、jobs/matching、diagnosis、analytics 验收。PASS 可集成；BLOCKED 需修复；ADAPT 需 A 公共适配并复验为 PASS。新增提交须重查，历史 PASS 不覆盖新提交或新增要求。
6. 一次只集成一个已通过的交付；立即跑相关模块与公共测试。失败保留证据，停止后续集成，不删除功能或注释失败逻辑。D 业务内部冲突交 D，公共层冲突由 A 处理。
7. 最终仅通过 `feat/core-a -> main` PR 合并，必须满足 [最终验收门槛](acceptance.md#最终系统门槛)。不直接 push main，不绕过分支保护。合并后核对 main 提交并验证关键启动与核心链路。

权限或认证失败时说明实际限制，不将已授权的普通 Git 工作转交用户。未要求后台监控时，不因本规则创建监控任务。

## 数据与证据

保留原文，解析不到的字段留空，不虚构学校、经历、技能、成果或数字。真实采样、课程样本、演示/合成数据分别标注；个人信息脱敏，真实密钥不入库。少量 JD 不代表整个市场，图表注明样本量、来源和时间范围。

收尾列出分支、commit、文件、验收/集成情况、实际检查和剩余问题。记录真实发生的需求拆解、架构选择、AI 编码与审查、适配、冲突、环境差异和演示验证；历史证据保留当时语境，不改写成当前结果。
