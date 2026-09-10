# Vitae 系统架构

## 目标与当前边界

依据本地实验指导要求 T5：Level 1 简历编辑/文本解析与关键词匹配；Level 2 STAR 与定向 AI 优化；Level 3 就业市场分析。A 负责公共平台与集成，B 负责 Resume，C 负责 Jobs/Matching，D 负责 Diagnosis，E 负责 Analytics；详见[五人分工](../T5_FIVE_PERSON_ALLOCATION.md)。完整要求见 [T5 对照表](../T5_REQUIREMENTS_MATRIX.md)。

当前启动模板的四个 provider 均为正式实现；Resume 与 Diagnosis 使用配置的模型，缺少密钥时明确报错，不自动回退 Mock。Resume 支持字段保护、确认、保存和历史读回，前端使用 React + TypeScript。`/ready` 检查数据库与 provider 就绪情况，不保证外部 AI 密钥有效性或输出质量。历史集成结果见验收台账。

## 分层与责任映射

| 路径 | 责任 |
| --- | --- |
| `backend/main.py`、`backend/api/routes.py` | A，生命周期、公共路由和错误响应 |
| `backend/core/` | A，配置、连接、公开 ports、模块加载及事务编排 |
| `backend/schemas/contracts.py` | A，共享输入输出；契约 v1 |
| `backend/models/entities.py` | A，共享持久化结构 |
| `tests/core/`、`scripts/smoke.py` | A，公共集成验证 |
| `examples/`、`scripts/check_member.py`、`scripts/check_scope.py` | A，合成样例、成员接入自检与范围检查 |
| `frontend/index.html`、`frontend/src/core/`、`frontend/src/App.tsx`、`frontend/src/pages/`、全局样式 | A，同源公共壳、API 客户端、React 页面、导航、状态及流程编排 |
| `backend/modules/resume/` | B，AI 结构化解析、字段保护与编辑保存 |
| `backend/modules/jobs/` | C，JD 关键词、可解释匹配与语义增强 |
| `backend/modules/diagnosis/` | D，已集成诊断实现，custom/openai_chat 真实模型已验证；其他协议有离线测试 |
| `backend/modules/analytics/` | E，已录入 JD 的来源、技能和分组薪资统计 |

业务目录由成员创建。业务模块可以导入公共 Schema/ports；A 只导入成员发布的公开入口，不导入内部函数。现有标准路由保持稳定，接入模块时替换 provider；需要额外路由时提交集成请求，由 A 挂载到 v1。

前端使用 React + TypeScript + Vite，React Router 管理页面，Context 管理共享选择、草稿与结果；保留并类型化已有 controller 的状态转换。开发时 Vite 代理现有 API，生产时 FastAPI 托管 `frontend/dist`。Windows 构建先运行 npm 安装/构建，只打包静态产物，最终用户无需 Node.js。详见 [前端接入](frontend-integration.md) 和 [迁移验证](frontend-product-shell.md)。前端与后端测试通过不自动代表外部模型质量验收。

## 四个公开接口

接口定义在 `backend/core/ports.py`；返回 Pydantic 模型或具有相同字段的字典。每个配置创建一个共享实例，因此实现需要线程安全；不要在实例保存单次请求状态。同步方法在线程池执行。网络超时、重试和外部客户端清理由业务模块负责，接入前需明确最大执行时间；本骨架尚无强制任务超时或任务队列。

| 成员 | 方法 | 输入 → 输出 |
| --- | --- | --- |
| B / resume | `parse` | `TextInput` → `ResumeData` |
| C / jobs | `parse` | `JDInput` → `JDData` |
| C / jobs | `match` | `Resume, JD` → `MatchResult` |
| D / diagnosis | `diagnose` | `DiagnosisInput` → `DiagnosisResult` |
| E / analytics | `analyze` | `list[JD]` → `AnalysisResult` |

例如 B 实现 `backend.modules.resume.public:ResumeService` 后，设置 `T5_RESUME_PROVIDER=backend.modules.resume.public:ResumeService`。A 在 `core` 中添加必要 adapter，将旧实现输出转换为公共模型，再配置 adapter 的路径；不修改成员内部实现。

所有 provider 输出重新校验：字段类型、score 范围、关联 ID 不一致或异常均返回 502，不持久化失败结果。禁止静默使用 Mock 掩盖真实模块错误。

## 数据库与事务

SQLite 保留为零服务演示默认方案；PostgreSQL + pgvector 已落地并真实测试。C 提供模型/维度/距离，A 提供空间隔离、vector 字段、索引、VectorRepository 和显式版本迁移，详见 [数据库契约](postgres.md)。基础公共表：

| 表 | 字段与关系 |
| --- | --- |
| `resumes` | `id` 主键、`payload` JSON（ResumeData）、`is_mock`、`created_at` UTC |
| `jobs` | `id` 主键、`payload` JSON（JDData）、`is_mock`、`created_at` UTC |
| `matches` | 公共字段 + `resume_id`/`jd_id` 外键与索引，payload 为 MatchResult |
| `diagnoses` | 公共字段 + 两个外键与索引，payload 为 DiagnosisResult |
| `schema_migrations` | 已应用的非破坏性迁移版本 |
| `vector_spaces`（PG） | 不可混用的模型/预处理标识、维度、距离 |
| `document_vectors`（PG） | vector 列、空间/源外键、source_hash，按空间和源类型隔离 |

关系字段独立列，业务结构存 JSON。普通记录 UUID 由 A 生成；固定市场快照导入使用来源/日期/原文的确定性 ID 实现去重。SQLite 每连接启用外键。创建记录后不提供原地更新/删除，以保留结果关联的原始输入。Resume 编辑器通过 POST /resumes 保存新版本，再 GET 比对确认值；raw_text 保留，重解析不覆盖用户编辑。Analytics 公共层统一筛选来源与日期，纯统计 provider 只接收 JD，不访问数据库；扩容前需下推数据库筛选/聚合。

每请求一个 session/事务，在 HTTP 响应发送前完成提交；错误自动回滚。`/workflow` 内匹配与诊断同事务，诊断失败不会留下半条流程结果。服务启动调用 migrate(engine) 并在退出时释放连接。迁移 1 接纳旧表，2 补 JD 可选 JSON 字段，3/4 在 PG 创建向量与片段表，5 补来源默认值；不自动重建或删除数据。

简历/JD 来源为 Mock 时，后续结果继续标记 Mock，即使计算 provider 已换为真实实现。解析记录通过响应头暴露 Mock 状态；结果直接带 `is_mock`。


## 运行与验证依据

依赖由 uv.lock 固定。数据库提交在 HTTP 成功响应前完成，错误回滚；公共测试验证事务、外键与输出契约。当前测试和环境限制见 [验证记录](validation.md)，完整模块验收见 [台账](acceptance.md)。

C 负责 jobs 内的 Matching/Embedding，D 负责 Diagnosis；A 负责公共数据存取与适配，避免模块直接依赖对方内部实现。
