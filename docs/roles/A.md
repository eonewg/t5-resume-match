# A：平台、简历、市场分析与最终交付

固定分支 `feat/core-a`。遵守 [团队约定](../team-rules.md)，完整功能要求见 [T5 对照表](../../T5_REQUIREMENTS_MATRIX.md)。本文件是共享角色说明，本地 AGENTS.md 引用本文件。

## 责任与目录

A 负责 `backend/core/`、`backend/api/`、`backend/main.py`、公共 models/schemas、根配置和依赖、`frontend/src/core/` 及公共壳；同时负责前后端的 `modules/resume/`、`modules/analytics/`，以及 `tests/core/`、`tests/resume/`、`tests/analytics/`、`tests/quality/`、scripts、CI、示例、共享文档和交付材料。其他实际公共文件按职责映射，不侵入 D 业务。

## 必须交付

- Level 1：粘贴原文、自动结构化、字段展示和编辑、保存后重新读取、保留原文；字段缺失留空，不虚构内容。已有保存 API 不等于编辑器完成。
- 公共链路：简历/JD 选择、持久化、统一 API、四模块 provider/ports、前端注册与流程串联。契约变化同步文档、兼容策略和测试。
- Level 3：聚合系统已录入 JD，展示近期热门技能词云、各岗位薪资分布、技能要求分布和简短职业规划/市场观察；标记来源、样本量、时间范围及缺失值，不把少量样本外推整个市场。
- 数据库：实际 PostgreSQL 连接、pgvector 扩展、SQLAlchemy/pgvector 依赖、vector 字段、表与索引、读写/查询 adapter、初始化/迁移和真实集成测试。D 决定向量化对象、模型、维度、距离和评分，A 按明确需求落地数据库。SQLite 仅为过渡演示。
- 问题定义：组织至少 2 款主流招聘 APP 竞品分析、至少 5 份真实 JD、至少 3 份学生简历和《求职市场痛点分析报告》，D 提供表达/技能 gap 分析。脱敏且标明来源，未收到真实材料不得用合成数据补数。
- 交付：E2E、运行/环境变量/依赖说明、clean clone / fresh install、答辩原始与优化简历对比，以及真实 AI 辅助全过程证据。

## 验收与集成

1. 检查 D 准确提交相对共同祖先的变化，并与当前 A 基线比较，区分继承公共代码与越界修改。检查敏感信息、无关大文件、产物、契约和模块测试。
2. jobs/matching 必须有技能/工具提取、关键词基线、0–100 分数、已匹配/缺失技能、与 gap 一致的解释；只有向量 cosine 分数时 BLOCKED。
3. diagnosis 必须支持平淡经历的 STAR 增强与 JD 定向关键词、经历突出和量化补充建议；不编造事实或数字，不把真实失败伪装为 Mock 成功，真实/Mock 明确标记。
4. D 业务问题写明文件、复现与预期，交 D 修复；公共问题由 A 适配。未经授权不代发外部消息。准确提交 PASS 后才能集成，ADAPT 需完成复验。
5. resume、analytics 也须提供代码、接口、测试与浏览器证据，不因 A 自己开发而免验。结果写入 [模块台账](../acceptance.md)。

## 最终验证与报告

执行 `uv sync --locked`、`uv run --locked pytest -q`、`uv run --locked ruff check backend tests scripts examples`、`uv run --locked ruff format --check backend tests scripts examples`、`node scripts/check_frontend.mjs`；另外真实验证 PostgreSQL/pgvector、浏览器 E2E、clean clone / fresh install、无密钥的 .env.example 和 README 可复现性。离线替身测试不代表真实 AI 质量和延迟已验证。

最终门槛与 PR 流程遵循团队约定和验收台账。交付列出分支、commit、文件、模块验收、已集成分支、测试与未解决项。架构决策、接口适配、AI 辅助过程、冲突及环境差异只记录真实证据。
