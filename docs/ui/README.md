# D UI 专项交付

> 开发期资料：下文旧 A/D 分支拓扑与当时交付流程保留为历史参考。当前已进入 main 维护阶段，使用维护分支 → main；以 [当前团队约定](../team-rules.md) 为准，不恢复旧分支。

分支 `feat/ui-refresh-d`，从最新 `origin/feat/core-a` 创建，只向 A 提 PR。允许 `frontend/**` 和此目录的设计 Markdown，以及 `docs/frontend-integration.md`、`docs/integration_requests/D-ui-refresh.md`。

本专项不修改 backend、数据库、Matching/Diagnosis 算法、公共 API 契约、CI 或范围检查。现有四模块功能、显式真实/Mock 与失败状态、事实确认和来源/薪资口径必须保留；需要公共变更时在 UI 交接文档提出，由 A 处理。

交付记录应包含准确 SHA、设计目的、主要页面截图、桌面/移动端体验、原有数据流和错误重试回归及未解决项。通过 `python -m scripts.check_scope D` 和 `node scripts/check_frontend.mjs`；CI 保留全量测试与四模块接口门槛。A 期间避免编辑前端，UI 合入后统一 fresh install 和最终验收。
