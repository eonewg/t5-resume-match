# AGENTS.md — A（T5 严格版）

> 开发期资料：下文旧 A/D 分支拓扑与当时交付流程保留为历史参考。当前已进入 main 维护阶段，使用维护分支 → main；以 [当前团队约定](docs/team-rules.md) 为准，不恢复旧分支。

你是 T5「AI 简历诊断与岗位匹配系统」的 A Agent。

最高原则：所有开发决策必须优先满足课程 T5 的明确要求。不要把项目泛化成通用招聘平台，也不要在核心功能完成前开发与 T5 无关的功能。

## 1. 当前协作方式

项目代码由两名主要开发 owner 维护：

- A：公共平台 + resume + analytics + 数据库 + 最终集成
- D：jobs + matching + diagnosis

你固定在 `feat/core-a` 开发。

D 固定使用 `feat/intelligence-d`，从最新 `origin/feat/core-a` 创建，并向 `feat/core-a` 提 PR。

D 负责 Jobs、Matching、Embedding 和 Diagnosis；A 负责公共平台、Resume、Analytics、QA、数据库及最终交付。

每次任务开始：

1. `git status`
2. `git fetch origin`
3. 确认当前为 `feat/core-a`
4. 不覆盖未知未提交修改

禁止 force push、hard reset、随意 rebase 已推送历史、`git add .`。

## 2. T5 是唯一功能边界

每做一个功能前都检查它对应 T5 哪一条。

优先级：

1. Level 1
2. Level 2
3. Level 3
4. 测试、运行说明、答辩演示
5. 其他增强

无法对应 T5 的功能默认不做。

## 3. 你负责的 T5 功能

### 3.1 Level 1：结构化简历编辑器

必须完整实现：

- 粘贴简历文本
- 自动解析为结构化字段
- 结构化展示
- 用户可编辑字段
- 保存并重新读取
- 保留原始文本
- 解析失败字段为空，不虚构经历、学校、公司、技能

不能把“只解析不允许编辑”的页面称为结构化简历编辑器。

### 3.2 公共数据与 API

负责：

- 简历、JD、匹配结果、诊断结果的数据模型
- FastAPI 公共路由
- 模块 provider / ports / contracts
- 工作台中的简历/JD选择状态
- 各模块串联

公共契约修改必须同步测试和文档。

### 3.3 Level 3：就业市场分析智能体

必须以系统中已录入 JD 为数据源，至少完成：

- 近期热门技能词云
- 各岗位薪资分布图
- 各岗位技能要求分布图
- 简短市场观察/职业规划说明

必须区分：

- 真实人工采样 JD
- 课程样本
- 演示/合成数据

不能基于少量样本声称代表整个就业市场。

JD 模型必须能容纳薪资信息；解析不到时允许空值。

### 3.4 PostgreSQL + pgvector

课程推荐技术栈明确包含 PostgreSQL + pgvector，最终项目按此落地。

你负责：

- PostgreSQL 实际连接
- pgvector 扩展
- SQLAlchemy / pgvector 依赖
- vector 字段
- 表结构
- 索引
- 向量读写与查询 adapter
- 数据库初始化/迁移
- 集成测试

不能因为 SQLite 更方便就把最终系统停留在 SQLite。

D 决定 embedding 模型、维度、距离方式和匹配算法；你根据明确需求实现数据库侧。

## 4. 问题定义阶段也必须交付

T5 不只是写代码。

你负责推动并整理：

- 至少 2 款主流招聘 APP 的竞品分析
- 至少 5 份真实 JD
- 至少 3 份学生简历
- 表达差距分析
- 技能差距分析
- 《求职市场痛点分析报告》

样本包含个人信息时必须脱敏。

报告中明确系统主线：

“结构化简历 → JD 匹配 → AI 定向诊断 → 就业市场分析”。

## 5. 与 D 的职责边界

D 负责：

- JD 解析
- 技能/工具提取
- 关键词匹配
- gap 清单
- 向量匹配
- STAR 优化
- JD 定向 AI 诊断

你不要为了图省事重写 D 的业务算法。

你负责公共数据库、API、前端注册和最终集成。

D 若需要：

- vector 维度
- 索引
- 新字段
- 公共 API
- 根依赖

应提交明确集成请求，你在公共层实现。

## 6. 验收 D 时必须按 T5 检查

### Level 1 matching

不能只看“能出一个分数”。

必须验证：

- JD 技能/工具提取
- 关键词匹配是基础逻辑
- 0–100 分数
- 已匹配技能
- 缺失技能
- 分数与 gap 一致
- 解释清晰

如果只有 embedding cosine score，没有课程要求的关键词匹配基线，则 BLOCKED。

### Level 2 diagnosis

必须验证：

- 一段平淡经历能得到 STAR 优化建议
- 输入 JD 后能给出关键词强化建议
- 能建议补充量化成果
- 不虚构数字
- 不把失败伪装成 Mock 成功
- 真实/Mock 明确标记

## 7. 两 owner 协作配置

A 维护以下当前协作规则和工具，确保 owner、分支、模块验收一致：

- `docs/team-rules.md`
- `docs/roles/A.md`
- `docs/roles/D.md`
- `docs/acceptance.md`
- README / onboarding / PR template
- `scripts/member_specs.py`
- `scripts/check_scope.py`
- `scripts/check_member.py`
- 相关 CI

验收单位固定为以下模块：

- resume
- jobs/matching
- diagnosis
- analytics

D 分支必须为 `feat/intelligence-d`，PR base 必须为 `feat/core-a`。

## 8. AI 辅助开发全过程记录

课程要求 AI 深度参与需求、设计、编码、测试、文档。

因此仓库/报告中要能留下真实证据：

- AI 辅助需求拆解
- 架构/Schema/API 设计
- Codex 编码
- AI 辅助测试与代码审查
- AI 辅助运行说明、演示脚本与复盘

只记录真实发生的过程，不编造。

## 9. 最终答辩链路

最终系统必须能现场演示：

1. 粘贴原始简历
2. 自动结构化
3. 编辑并保存
4. 输入/选择 JD
5. 显示关键词匹配度与 gap
6. AI STAR 优化
7. JD 定向关键词/量化建议
8. 原始简历 vs 优化后简历对比
9. 就业市场分析
10. 技能词云 + 薪资分布 + 技能要求分布

任何不能服务这条主链路的功能都降低优先级。

## 10. 最终验证

至少执行：

- `uv sync --locked`
- `uv run --locked pytest -q`
- `uv run --locked ruff check backend tests scripts examples`
- `uv run --locked ruff format --check backend tests scripts examples`
- `node scripts/check_frontend.mjs`

此外必须完成：

- 真实 PostgreSQL 验证
- 真实 pgvector 验证
- 浏览器 E2E
- clean clone / fresh install
- `.env.example` 无真实密钥
- README 按步骤可复现

最终只通过 `feat/core-a -> main` PR 合并。
