# D：开发计划与公共集成请求

本次交付仅为开发约定与文档修复，不包含新增 Jobs/Matching/Embedding 实现。
开发流程：`feat/intelligence-d → feat/core-a`。本轮同步基线：`6bcdf7b`。

## 统一依据

- [T5 需求矩阵](../../T5_REQUIREMENTS_MATRIX.md)
- [A/D 两人分工](../../T5_TWO_PERSON_ALLOCATION_STRICT.md)
- [D 职责](../roles/D.md)
- [公共协作规则](../team-rules.md)
- [D Agent 执行约定](D-agent-policy.md)

需求和分工只引用统一文件，不维护完整副本；课程小组组织形式按课程要求执行。

## 实现顺序与状态

| 阶段 | 验收内容 | 当前状态 |
| --- | --- | --- |
| Level 1 JD | 原文、技能/工具、岗位及可确认薪资 | JobsService 未实现；公共 API 不等于解析完成 |
| Level 1 关键词匹配 | 0–100、matched/missing、评分解释与异常测试 | 未实现；示例/Mock 不计验收 |
| Level 2 STAR | 原文/优化/理由、事实边界、待补充成果 | Diagnosis 已有代码和离线测试；真实模型质量未验证 |
| Level 2 JD 定向诊断 | 关键词、已有经历、技能/表达 gap、量化补充建议 | 已有结构，需结合交接样本逐项评估 |
| 向量增强 | 模型/维度/距离/归一化/组合权重/降级 | 未实现，参数待定，不替代关键词基线 |
| Level 3 数据支持 | tools/salary/raw_text 等解析、持久化与分析口径 | D 解析待开发，公共字段待 A 设计 |
| 样本分析 | 技能/表达 gap、人工 baseline 对照 | A 已交接数据；D 算法分析待开发 |
| 最终系统 | 全链路、真实 AI、PostgreSQL/pgvector | 未完成真实验收 |

关键词候选公式为 `100 × 唯一关键词交集数量 / JD 唯一关键词数量`，先归一化再去重；
无 JD 关键词明确无法有效评估。这是计划，不是已实现算法。

## 已有公共开发支持

A 已提供 A/D owner 映射、D 双模块目录范围、自检、新分支 CI 触发与当前角色文档。
模块命令为 `check_member jobs` / `check_member diagnosis`，不使用角色参数。
`check_member --ci` 要求 D 两模块均存在并有测试。jobs 缺失属于业务未完成，不是映射问题；
不得放宽公共检查，使文档交付冒充双模块完成。

## 仍需 A 协调

1. **JD 字段**：现有 JDData 有 title/company/jd_text/skills。tools、薪资原文/上下界/币种/周期、
   raw_text 映射由 A 设计兼容契约与持久化，D 后续解析。未知薪资不强制换算。
2. **向量设施**：D 确定实际模型/维度/距离/评分策略后，A 实现 pgvector、索引、迁移及真实数据库测试。
   当前不能把内存向量或 SQLite 验证称为 PostgreSQL/pgvector 验证。
3. **超时预算**：公共客户端默认 45 秒，Diagnosis 重试可能超过；A/D 协调等待与模型超时。
4. **样本缺口**：依据 [数据交接](D-data-handoff.md) 和 [数据规范](../../data/README.md)，
   已有 9 份真实来源 JD、21 份合成 JD、5 份合成简历和 15 组人工 baseline；真实学生简历仍为 0。
   A 继续管理授权脱敏简历及缺失方向 JD，D 做样本级分析，不将人工标注当成系统输出或外推整个市场。

## 验证

运行锁定依赖、完整 pytest、全仓 Ruff check/format、统一前端、diagnosis/jobs 模块自检、
范围检查、CI 模式检查和数据校验。jobs 缺失明确记录失败，Diagnosis 通过不等于 Jobs/Matching 完成。
本次文档修复不调用收费模型，不新增 UI 功能；另外核验链接、指令副本和公共文件完整性。

本轮实测：锁定依赖同步成功；pytest 76 passed（diagnosis 44、core 32）；
统一前端 24 passed；Ruff check / format check、diagnosis 模块自检和数据校验通过。
Markdown 链接均可解析，四份指令副本一致。
jobs 模块自检及 CI 模式自检失败原因均为缺少 `tests/jobs/test_*.py`，不声称双模块验收或 CI 全绿。
