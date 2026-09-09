# T5 两人开发分工（严格对齐课程选题五）

## 基本原则

课程正式小组仍按原课程组织形式保留，不把“2 人开发 owner”解释成“2 人小组”。

代码开发由 A、D 两个 owner 负责，项目功能、文档和最终交付必须完整覆盖 T5 的 Level 1、Level 2、Level 3。

四个业务模块为：

- `resume`
- `jobs`
- `diagnosis`
- `analytics`

## A：平台、简历、市场分析与最终交付

分支：`feat/core-a`

负责 T5 中：

### Level 1

- 结构化简历编辑器
- 文本粘贴自动解析
- 结构化字段编辑
- 简历保存/读取
- JD/简历公共数据模型和 API
- 公共工作台与模块串联

### Level 3

- 就业市场分析智能体
- 热门技能词云
- 岗位薪资分布图
- 岗位技能要求分布图
- 数据口径说明

### 基础设施

- FastAPI 公共层
- PostgreSQL
- pgvector
- SQLAlchemy
- 公共 Schema / ports
- 配置与依赖
- 公共前端壳和模块注册
- E2E、README、fresh install、最终 PR

主要目录：

- `backend/core/`
- `backend/api/`
- `backend/models/`
- `backend/schemas/`
- `backend/modules/resume/`
- `backend/modules/analytics/`
- `frontend/src/core/`
- `frontend/src/modules/resume/`
- `frontend/src/modules/analytics/`
- `tests/core/`
- `tests/resume/`
- `tests/analytics/`
- `tests/quality/`

## D：JD、岗位匹配与 AI 简历诊断

固定分支：`feat/intelligence-d`

必须从最新 `origin/feat/core-a` 创建。

所有 D 开发与交付统一使用 feat/intelligence-d → feat/core-a PR。

负责 T5 中：

### Level 1

- JD 输入后的文本解析
- 技能/工具关键词提取
- 关键词匹配基线
- 0–100 匹配度
- 已匹配技能
- 缺失技能 / gap 清单
- 评分解释

### Level 2

- STAR 内容增强
- 针对 JD 的简历定向优化
- 建议强化的关键词
- 量化成果补充建议
- 真实/Mock AI 严格区分

### Embedding 与向量匹配增强

- embedding 模型/接口
- embedding 维度
- 向量距离策略
- 关键词 + 向量组合评分

注意：课程明确要求 Level 1 的“基于关键词（技能、工具）的简单匹配”，因此不能只实现 embedding/pgvector。

主要目录：

- `backend/modules/jobs/`
- `backend/modules/diagnosis/`
- `frontend/src/modules/jobs/`
- `frontend/src/modules/diagnosis/`
- `tests/jobs/`
- `tests/diagnosis/`

## PostgreSQL + pgvector 边界

D 决定算法参数：

- 向量化对象
- embedding 模型
- 维度
- 距离方式
- 匹配评分逻辑

A 落地数据库：

- PostgreSQL 连接
- pgvector 扩展
- vector 字段
- SQLAlchemy 模型
- 索引
- 查询与持久化
- 数据库集成测试

最终系统必须真实验证 PostgreSQL + pgvector，而不是只在文档里保留配置示例。

## 问题定义阶段额外任务

严格按 T5 要求补齐：

- 至少 2 款主流招聘 APP 竞品分析
- 至少 5 份真实 JD
- 至少 3 份学生简历
- 表达 gap + 技能 gap 分析
- 《求职市场痛点分析报告》

A 负责材料组织和报告；D 负责匹配/诊断角度的 gap 分析。

## Git 流程

D：

`origin/feat/core-a -> feat/intelligence-d -> PR -> feat/core-a`

A：

持续在 `feat/core-a` 开发，验收 D 后统一集成。

最终：

`feat/core-a -> main`

## 最终完成条件

必须按 Resume、Jobs/Matching、Diagnosis、Analytics 对照 T5 逐条验收：

- Level 1：结构化简历编辑器 + JD 输入 + 关键词匹配度 + gap 清单
- Level 2：STAR 内容增强 + JD 定向优化
- Level 3：技能词云 + 薪资分布 + 技能要求分布
- FastAPI
- PostgreSQL + pgvector
- 关键词规则 + 向量相似度
- 5 JD + 3 简历 gap 分析
- 原始简历 vs 优化简历答辩演示
- 系统可从 fresh install 正常启动
