# A → D：Level 1 已集成与公共契约

2026-09-08：PR #5（D 源 `fe3dfbb65ec5fe46852a6fb9ddd0a42adf2c92f5`）已合入 feat/core-a，合并提交 `ebbe251`。
正式入口为 `/#jobs`，默认 `T5_JOBS_PROVIDER=backend.modules.jobs.public:JobsService`。main 未合并。

## JD

已发布 [JD HTTP/数据契约](../api-contract.md)：skills、tools、salary、salary_min/max、currency、salary_period。
旧 `parse(JDInput) -> JDData` 及 `match(Resume, JD)` 不变；A HTTP 层用 JDCreate 接受额外确认字段，传给 parse 的仍为原三字段 JDInput。

- 当前 skills 仍表示技能/工具并集，以保持 D 的关键词分母和评分不变；tools 是可单独持久化的标签。
- D 可在 JDData 返回 tools 和薪资字段；A 不导入 D 的内部词表，也不替 D 实现提取规则。
- 明确提供的确认字段优先于解析值，skills=[] 表示确认为空，salary=null 表示清空；未提供的字段采用解析值。
- 金额是对应 currency/period 的实际数值，不是旧采集数据中统一 K/月的隐式单位；未知留空，不自动折算。
- D 旧实现继续可用；其 parse_detail 的技能/工具分离尚未自动映射到公共 tools，薪资解析和相应展示由 D 后续实现。

## 向量

已提供 [VectorRepository 契约与运行说明](../postgres.md)，实际 PostgreSQL + pgvector smoke 通过。
请 D 通过下一份 integration request 确定模型/版本、预处理/向量化对象、维度、距离、归一化和组合评分策略。
公共层接受这些显式参数，但不作默认选择；模型/配置改变须新空间，默认精确查询，HNSW 近似仅显式启用。
此次没有 embedding 实现、真实模型调用或权重调参。

## 独立材料

[2026-09-08 holdout](../../data/holdout/2026-09-08/README.md) 包含 5 份真实 JD + 3 份公开学生时期简历，附来源/版本/许可/脱敏说明。
不得用于调整已冻结词表后仍称为独立测试。准备人工标准答案时区分必选/任选/加分与技能/表达 gap；保留原有样本内报告及本批语言/雇主/时间局限。

## 回归和剩余边界

本地全量 Python（含真实 PG）142 passed、前端 33 passed；Diagnosis 原有 44 项离线回归通过。
A 仅在 D 测试中显式配置 resume_provider="mock"，保留原 Mock 来源测试意图；没有改动 D 业务算法。
本阶段不等于最终 T5 验收：Resume 专用编辑器 UI、Analytics、D 新字段解析/Embedding、真实 AI 输出质量仍待后续完成。
