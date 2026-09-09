# A 产品阶段交接：Resume 与 Analytics

基线 `ee983782ef7c8af411869b52a55422267be54b96`，承接 PR #6 merge `79e35a9de94245c466e9218ef132643d92c1eb0a`。A 在 feat/core-a 完成产品面；D 新分支继续独立开发，未修改 Jobs/Embedding/Diagnosis 业务或其测试文件，未合 main。

- Resume 普通入口 `/#resume`：首次解析草稿、手动字段保护、显式采用单项建议、确认保存、GET 逐字段核对、历史版本加载。编辑新建记录，不修改旧 ID；匹配继续只接收已保存的 Resume/JD。
- student-03 原先因 Relevant/Other Experience 未被识别而一直归到 Education。现按明确标题与 Markdown 层级提取 10 段经历和原文明确的 Python；不推断 SQL 等其他技能，不从 raw_text 恢复用户删除的字段。
- D 的历史 holdout 报告对应旧 A 解析输出（student-03 empty）。本次没有重写 D 报告；后续 D 真实模型评估应固定新 A SHA，单独报告解析输入变化，不将因此发生的分数变化当作算法质量提升。
- JDInput 三字段 parse port、PairInput、MatchResult、MatchContext/VectorRepository 和 Diagnosis 协议保持不变。JDData/HTTP JDCreate 只新增有默认值的 source_type、source_url、source_name、collected_at；source_type=real 要求 URL 与采集日期。D 无需更改匹配算法，新增字段可透传/忽略。
- Analytics 默认真实 provider；旧 summary/skills 仍有效，新增可选 market 与 HTTP scope。API 统一来源/日期筛选，图表使用已保存 skills 与薪资，不重复解析或跨币种/周期混算。迁移 5 非破坏性补来源默认值。
- 固定五份真实 JD 可通过 `POST /api/v1/analytics/sample-jobs` 或页面按钮显式导入，重复/并发不重复计数。该批薪资未知；合成薪资图形测试不混入 real 筛选。

接口细节见 [API 契约](../api-contract.md)，真实样本结果见 [市场报告](../analytics-sample-analysis.md)，实际验证见 [验证记录](../validation.md)。D 新 PR 到达后再由 A 检查新协议兼容性、真实模型结果、事实边界、失败与延迟；本次不预先宣称该 PR PASS。
