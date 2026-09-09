# D：Jobs、Matching、Embedding 与 AI Diagnosis

当前从最新 main 创建维护分支，PR 指向 main；不要求 owner 后缀。
下述 D 模块职责用于协作审查；可选 local scope 保留目录约束，现代 PR 的 CI 不按 owner 限制路径。
遵守 [协作规则](../team-rules.md) 和 [T5 需求](../../T5_REQUIREMENTS_MATRIX.md)。

## 责任范围

D 负责 JD 输入与解析、技能/工具/薪资提取、关键词匹配、gap、embedding 和组合评分，以及 STAR 与 JD 定向 AI 诊断。

允许修改 backend/modules/jobs/、backend/modules/diagnosis/、对应 frontend/src/modules/ 目录、tests/jobs/、tests/diagnosis/ 和 docs/integration_requests/D-*.md。Matching 与 Embedding 属于 jobs 模块；不另建跨 owner 依赖。

公共 API、Schema、数据库、根依赖/配置和公共前端由 A 维护。D 提交明确字段、向量参数、索引或接口请求，不能自行修改公共层。

## 公开入口与功能

| 模块 | 入口 | 方法 |
| --- | --- | --- |
| Jobs/Matching | backend.modules.jobs.public:JobsService | parse(JDInput) → JDData；match(Resume, JD) → MatchResult |
| Diagnosis | backend.modules.diagnosis.public:DiagnosisService | diagnose(DiagnosisInput) → DiagnosisResult |

公开类无参构造，同步方法；遵守 [API 契约](../api-contract.md) 和公共 ports。

- Jobs：JD 文本输入与复用，技能/工具和薪资解析；无法解析的字段允许为空，原文、标题、公司保持不变。持久化由公共 API 完成。
- Matching：先实现关键词基线，输出 0–100 分数、已匹配/缺失技能、gap 与一致解释；覆盖空技能、重复、大小写、无匹配等边界，不原地修改输入。
- Embedding：决定对象、模型/接口、维度、距离及关键词+向量组合评分，明确向 A 提交数据库需求。向量相似度是增强，不能替代关键词基线。
- Diagnosis：平淡经历 STAR 增强、JD 定向关键词/经历建议、量化成果补充提示；保留事实，不生成虚假数字，不把建议作为已确认事实。
- 问题定义：为真实脱敏样本提供表达/技能 gap 分析，支持 A 汇总报告。

## 测试和交付

按 [开发指南](../member-development.md) 分别自检 jobs、diagnosis。使用离线替身测试网络成功、超时、无效响应和失败路径；网络超时/重试有界，真实失败不能自动降级为 Mock 成功。真实模型质量与延迟单独验证，不能用离线结果代替。

UI 在自己的模块导出 mount，通过 [公共前端](../frontend-integration.md) 接入。PR 提供两个模块各自的功能、准确 SHA、契约/测试证据、复现和未完成项。A 按模块记录 PASS/BLOCKED/ADAPT，一个模块通过不代表另一个完成。
