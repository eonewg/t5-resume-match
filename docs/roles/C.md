# C：JD 与匹配模块

固定分支：`feat/jobs-c`。先读取根 [AGENTS.md](../../AGENTS.md)。

负责 JD 解析、技能提取、匹配分数与差距清单。允许修改 `backend/modules/jobs/`、`tests/jobs/`、`docs/integration_requests/C-*.md`。前端组件预留 `frontend/src/modules/jobs/`，需先与 A 确认共享前端工程。

不修改公共 Schema、数据库、路由或全局依赖。向量模型、pgvector 维度和索引需求提交 A；先完成可解释的关键词匹配。

实现 `backend.modules.jobs.public:JobsService`，无参构造，同步 `parse(JDInput) -> JDData` 和 `match(Resume, JD) -> MatchResult`。返回输入中的关联 ID；分数须为 0–100 有限值。

测试全匹配、部分匹配、无匹配、大小写/重复技能、JD 未识别到技能等情况。记录分数计算方式及未识别技能时的策略；分数和差距清单应一致。交付样例及测试命令，由 A 配置 `T5_JOBS_PROVIDER`。
