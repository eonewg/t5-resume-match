# A 公共架构与集成记录

## 目标与当前边界

依据本地实验指导要求 T5：Level 1 简历编辑/文本解析与关键词匹配；Level 2 STAR 与定向 AI 优化；Level 3 就业市场分析。A 负责公共平台、数据库、resume 编辑器与 analytics；D 负责 JD/匹配算法及诊断 Prompt。完整要求见 [T5 对照表](../T5_REQUIREMENTS_MATRIX.md)。

当前 A 已集成 diagnosis，resume、jobs、analytics 尚无真实模块实现；四个 provider 默认仍为 Mock。Mock 只验证传输和持久化，固定分数不能当真实评分。`/ready` 判断配置是否全部替换了 Mock，不对算法质量或外部 AI 服务可用性作保证。

## 分层与责任映射

| 路径 | 责任 |
| --- | --- |
| `backend/main.py`、`backend/api/routes.py` | A，生命周期、公共路由和错误响应 |
| `backend/core/` | A，配置、连接、公开 ports、模块加载及事务编排 |
| `backend/schemas/contracts.py` | A，共享输入输出；契约 v1 |
| `backend/models/entities.py` | A，共享持久化结构 |
| `tests/core/`、`scripts/smoke.py` | A，公共集成验证 |
| `examples/`、`scripts/check_member.py`、`scripts/check_scope.py` | A，合成样例、成员接入自检与范围检查 |
| `frontend/index.html`、`frontend/src/core/`、`frontend/src/app.js`、全局样式 | A，同源公共壳、API 客户端、导航、状态及流程编排 |
| `backend/modules/resume/` | A，简历解析与编辑，尚未创建业务实现 |
| `backend/modules/jobs/` | D，预留 JD 与匹配实现 |
| `backend/modules/diagnosis/` | D，已集成诊断实现，真实模型待验证 |
| `backend/modules/analytics/` | A，预留市场分析实现 |

业务目录由成员创建。业务模块可以导入公共 Schema/ports；A 只导入成员发布的公开入口，不导入内部函数。现有标准路由保持稳定，接入模块时替换 provider；需要额外路由时提交集成请求，由 A 挂载到 v1。

前端使用原生 JavaScript ES modules，由 FastAPI 托管，无生产构建依赖；组件目录按业务成员分工，导出 `mount(container, context)`，A 审阅后挂载。成员可用显式 preview URL 独立调试。详见 [前端接入](frontend-integration.md)。成员自检与 CI 会发现整个 tests 目录，但不自动判定业务验收 PASS。

## 四个公开接口

接口定义在 `backend/core/ports.py`；返回 Pydantic 模型或具有相同字段的字典。每个配置创建一个共享实例，因此实现需要线程安全；不要在实例保存单次请求状态。同步方法在线程池执行。网络超时、重试和外部客户端清理由业务模块负责，接入前需明确最大执行时间；本骨架尚无强制任务超时或任务队列。

| 成员 | 方法 | 输入 → 输出 |
| --- | --- | --- |
| A / resume | `parse` | `TextInput` → `ResumeData` |
| D / jobs | `parse` | `JDInput` → `JDData` |
| D / jobs | `match` | `Resume, JD` → `MatchResult` |
| D / diagnosis | `diagnose` | `DiagnosisInput` → `DiagnosisResult` |
| A / analytics | `analyze` | `list[JD]` → `AnalysisResult` |

例如 A 实现 `backend.modules.resume.public:ResumeService` 后，设置 `T5_RESUME_PROVIDER=backend.modules.resume.public:ResumeService`。A 在 `core` 中添加必要 adapter，将旧实现输出转换为公共模型，再配置 adapter 的路径；不修改成员内部实现。

所有 provider 输出重新校验：字段类型、score 范围、关联 ID 不一致或异常均返回 502，不持久化失败结果。禁止静默使用 Mock 掩盖真实模块错误。

## 数据库与事务

当前 SQLite 是零服务演示默认方案，SQLAlchemy 2 提供 PostgreSQL 连接入口。最终必须真实落地 PostgreSQL + pgvector；D 提供模型/维度/距离，A 负责 vector 字段、扩展、索引、读写查询 adapter、迁移和集成测试。这些仍是待实现/验证项。当前四张公共表：

| 表 | 字段与关系 |
| --- | --- |
| `resumes` | `id` 主键、`payload` JSON（ResumeData）、`is_mock`、`created_at` UTC |
| `jobs` | `id` 主键、`payload` JSON（JDData）、`is_mock`、`created_at` UTC |
| `matches` | 公共字段 + `resume_id`/`jd_id` 外键与索引，payload 为 MatchResult |
| `diagnoses` | 公共字段 + 两个外键与索引，payload 为 DiagnosisResult |

关系字段独立列，业务结构存 JSON，以支持初期可变字段；尚无需要数据库级筛选的技能查询。UUID 由 A 生成。SQLite 每连接启用外键。创建记录后不提供原地更新/删除，以保留结果关联的原始输入；编辑器应复用 POST /resumes 保存编辑后的新记录并重新读取，再生成新结果；当前尚无编辑器 UI。保留 raw_text，不能重解析覆盖用户编辑。后续更新/删除或版本关联扩展由 A 明确后写入契约。

每请求一个 session/事务，在 HTTP 响应发送前完成提交；错误自动回滚。`/workflow` 内匹配与诊断同事务，诊断失败不会留下半条流程结果。服务启动创建缺失表并在退出时释放连接。`create_all` 不是迁移工具；现有表变更需另行提交显式迁移，不自动重建数据。

简历/JD 来源为 Mock 时，后续结果继续标记 Mock，即使计算 provider 已换为真实实现。解析记录通过响应头暴露 Mock 状态；结果直接带 `is_mock`。

## 集成过程与个人报告素材（历史）

2026-09-07：原目录不是 Git 仓库，用户授权使用 gh 新建。初始化 main 后建立 feat/core-a；按用户修正将仓库改名为 t5-resume-match，同步修改 origin。main 只含初始基线，不自动合并 A 开发。

公共契约优先沿用 AGENTS.md 的简历、JD、匹配、诊断输入字段，再补充诊断输出、分析输出和持久化 ID。初始骨架阶段四成员接口尚不存在，当时没有真实接口冲突或多分支合并冲突，不能将预防方案写成已发生事件。

AI 辅助生成的首轮代码需要补充事务提交时点约束：数据库提交必须早于成功响应。现采用 function scope 的 session dependency，回滚、外键、输出校验均有集成测试。未进入成员目录修改算法。

Windows 执行器对全局 uv 缓存及 pytest 临时目录限制导致首次检查失败；uv 改用项目内缓存，pytest 在允许本地文件操作的执行上下文运行。依赖通过 uv.lock 固定，避免不同机器重新解析出不同版本。测试依赖目前有两项上游弃用提示，测试通过，不隐藏警告。

技术参考：[FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/)、[SQLAlchemy SQLite](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html)。
