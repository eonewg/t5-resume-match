# T5 模块验收台账

## 当前状态

验收单位固定为 Resume、Jobs/Matching、Diagnosis、Analytics；A 负责统一验收。当前代码存在于 feat/core-a，D 开发与 PR 使用 feat/intelligence-d → feat/core-a。

| 模块 | Owner | 当前实现 | 验收状态与待办 |
| --- | --- | --- | --- |
| Resume | A | 真实保守解析、preview 草稿、确认后保存/读取及原文保留 | API 链路通过，专用结构化编辑器 UI 待完成 |
| Jobs / Matching | D | PR #5 已集成；默认真实关键词 provider 和 Jobs 导航 | Level 1 关键词/分数/gap PASS；独立 tools/薪资自动解析与 embedding 待 D |
| Diagnosis | D | 已有服务、公共 provider 与前端挂载、离线测试 | 真实模型输出、延迟及 T5 全项待验证；不能据离线检查判定最终 PASS |
| Analytics | A | 公共基础统计接口、Mock；无真实模块实现 | 待实现词云、薪资/技能分布、来源口径与观察说明并验收 |

当前自动化检查见 [验证记录](validation.md)。功能目标与当前实现分别记录，不能把已接入、Mock 或测试通过等同于完整 T5 验收。

## 最终系统门槛

所有项目均需准确提交、命令/步骤、实际结果和证据位置；未执行写“待验证”，不预填 PASS。

| 门槛 | Owner | 当前差距 / 所需证据 |
| --- | --- | --- |
| 问题定义 | A 汇总、D 分析 | 至少 2 款招聘 APP 对比、5 份真实 JD、3 份学生简历，脱敏、来源与表达/技能 gap；痛点报告待提交验收 |
| Level 1 resume | A | 原文粘贴→解析→结构化展示→编辑→保存→重新读取；缺失字段留空 |
| Level 1 jobs/matching | D，A 提供持久化 | JD 输入保存复用、技能/工具提取、关键词基线、0–100 分数、matched/missing/gap 及一致解释；只有向量评分不通过 |
| Level 2 | D，A 串联 | 平淡经历 STAR、JD 定向关键词/经历建议、量化补充提示、不虚构事实；真实/Mock 与失败行为区分；真实模型待验证 |
| Level 3 | A，D 解析 JD | 已录入 JD 聚合的近期技能词云、薪资分布、技能要求分布、观察/职业建议；来源、样本量、时间范围和缺失值口径 |
| PostgreSQL + pgvector | A，D 提供参数 | 公共设施本阶段已真实通过连接、扩展、表/索引、repository、迁移与数据库测试；生产模型参数与 D 集成待后续 |
| NLP 与向量 | D | 关键词规则基线与向量相似度增强、组合评分解释；模型、维度、距离请求待明确 |
| 全链路演示与 E2E | A/D | 按 T5 对照表十步演示，包括原始/优化简历对比、全部图表；无未解释关键失败 |
| 可复现运行 | A | 主程序、数据库初始化、完整依赖安装、README、无密钥 .env.example；最终提交的 clean clone / fresh install |
| AI 过程与设计材料 | A/D | 真实需求拆解、架构/Schema/API、编码、测试审查、文档/演示复盘；原型工具采用情况如实说明 |
| 最终合并 | A | 四模块完整 PASS、全部集成、完整测试通过且 A 已 push；仅 feat/core-a → main PR，合并后复核启动/核心链路 |


## 验收与集成记录规范

每条记录必须包含日期、模块、owner、准确源 SHA、A 基线、变更范围、越界/误提交检查、契约检查、测试步骤与结果、未验证项、结论和下一步。集成后补充集成 SHA 与回归证据。

- PASS：准确提交在明确验收范围内通过，可集成。
- BLOCKED：存在必须修复的业务或越界问题，列出文件、复现与预期。
- ADAPT：需要 A 公共适配，复验 PASS 后才能集成。
- 待实现/待验收：尚无完整交付或未执行验收，不预填结论。

A 自有模块执行相同门槛；新增提交重新检查，集成失败保留证据并停止后续合并。最终只通过 feat/core-a → main PR 交付。

## 2026-09-08：PR #5 Level 1 正式集成与公共基础设施

- D 源：`fe3dfbb65ec5fe46852a6fb9ddd0a42adf2c92f5`；继承 A 基线 `844b89c`。本次先验证用户确认的未提交 Resume 基线并提交 `c4ef397`，然后合并 PR #5 为 `ebbe251`，目标仅 feat/core-a。
- PR diff 为 D jobs/diagnosis 文档、Jobs 模块与前端/测试，未越界修改 A 公共层；旧阻塞文档已对齐、PR 已脱离 draft 且可合并。准确源提交独立 worktree：Python 104 passed、前端 32 passed；GitHub 检查 8 项 SUCCESS。
- A 适配：默认 Jobs provider/正式注册，HTTP JDCreate 与兼容 JDData 字段、旧 JSON 迁移；D 旧 parse port 和关键词算法不变。D 测试仅增加显式 Mock Resume 配置以保留既有来源传播断言。
- 数据库：原生 Windows PostgreSQL 17.6 + pgvector 0.8.1 已启动连接、建扩展/表与索引、读写查询、迁移/约束/回滚通过；未选定或实现生产 embedding 模型。
- 独立材料：5 新真实 JD + 3 公开学生时期简历；不是 D 已有调词表样本，不伪造学生经历。历史/语言/单雇主限制见 [材料说明](../data/holdout/2026-09-08/README.md)。
- 本地验证：全量 Python（含 PG）142 passed、前端 33 passed、Diagnosis 44 项离线回归、PostgreSQL/pgvector 与 Resume → JD → keyword match smoke 通过。无头 Edge 默认导航、编辑后确认简历 API、33.33%/gap、502 重试、390px、重复导航选择保留通过。
- 结论：**PASS（本阶段范围）**。不代表完整 T5 PASS：Resume 编辑器 UI、Analytics、D tools/薪资解析、Embedding 与真实 AI 质量仍待后续。
- 给 D 的当前公共契约见 [A 交接](integration_requests/A-level1-vector-handoff.md)，详细验证见 [验证记录](validation.md)。

## 历史审查（已由以上准确新提交复验取代）

### PR #5 · 旧 D 文档交接 — 当时 BLOCKED

- 源提交：dd1933e02642172d4ddbf2c3cf0ac61a9b0e978b；A 基线：124466058255a4094615a7ea84d0a47a5082b1eb。
- 范围：6 个 Markdown 文件，位于 Diagnosis README 和 D 集成请求目录；无业务代码、公共 Schema、依赖或 CI 修改。未检出常见密钥/私钥格式。
- 当前 PR 为 draft，GitHub 显示冲突；检查结果为 1 项 FAILURE、3 项 CANCELLED，不能记为通过。
- 必须修复：同步最新 A 基线并解决文档冲突；D-agent-policy、D-two-person-allocation 与 D-strict-plan 含失效职责/流程叙述和过期命令，须改为当前 A/D 约定；共享需求/分工应引用根规范，避免复制后产生不同版本。
- D-strict-plan 将 owner 映射、双模块自检、分支触发和公共说明列为未完成，但当前 A 已具备这些能力。应只保留仍需处理的 JD 字段、向量参数、超时预算和样本等请求。
- Diagnosis README 的新增计划链接相对路径多了一层父目录，需要修复。
- 该 PR 仅文档交付，不代表 Jobs/Matching 或 Embedding 实现；本次未运行不存在的模块测试，也未合并。D 更新准确提交并重跑适用检查后复验。
