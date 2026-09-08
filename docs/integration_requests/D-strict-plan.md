# D：开发计划与公共集成请求

Level 1 已经 A 合并（PR #5）；本阶段实现可选本地 Embedding，默认关闭，待业务验收。
开发流程：`feat/intelligence-d → feat/core-a`。本轮同步基线：`ebbe251`。
Level 2 方案/验证/接口请求见 [语义匹配记录](D-embedding-contract.md)，真实模型在 8 组新对照中排序正确 6 组，否定/学习意向仍存在误判。
具体实现、验收证据和待 A 集成事项见 [本阶段记录](D-jobs-integration.md)。

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
| Level 1 JD | 原文、技能/工具、岗位及可确认薪资 | 原文、输入岗位名、技能/工具词表解析已实现；独立 tools/薪资公共字段待 A |
| Level 1 关键词匹配 | 0–100、matched/missing、评分解释与异常测试 | 规则服务、28 项测试及前端预览通过；待 A 业务验收/默认导航集成 |
| Level 2 STAR | 原文/优化/理由、事实边界、待补充成果 | Diagnosis 已有代码和离线测试；真实模型质量未验证 |
| Level 2 JD 定向诊断 | 关键词、已有经历、技能/表达 gap、量化补充建议 | 已有结构，需结合交接样本逐项评估 |
| 向量增强 | 模型/维度/距离/归一化/组合权重/降级 | MiniLM 384 维 cosine 本地实现及降级已验证；默认关闭；pgvector 待 A port，生产语义验收未完成 |
| Level 3 数据支持 | tools/salary/raw_text 等解析、持久化与分析口径 | 内部技能/工具分离；独立字段、薪资及分析口径待 A 契约 |
| 样本分析 | 技能/表达 gap、人工 baseline 对照 | 30 JD / 40 配对关键词样本内报告完成；表达 gap 和独立评测仍待推进 |
| 最终系统 | 全链路、真实 AI、PostgreSQL/pgvector | 未完成真实验收 |

已实现公式 `round(100 × 唯一关键词交集数量 / JD 唯一关键词数量, 2)`，先归一化再去重；
无 JD 关键词返回契约占位值 0，明确无法有效评估，页面不展示数字评分。

## 已有公共开发支持

A 已提供 A/D owner 映射、D 双模块目录范围、自检、新分支 CI 触发与当前角色文档。
模块命令为 `check_member jobs` / `check_member diagnosis`，不使用角色参数。
`check_member --ci` 要求 D 两模块均存在并有测试。本阶段补齐 Jobs，保持公共检查原有标准。

## 仍需 A 协调

1. **JD 字段**：现有 JDData 有 title/company/jd_text/skills。tools、薪资原文/上下界/币种/周期、
   raw_text 映射由 A 设计兼容契约与持久化，D 后续解析。未知薪资不强制换算。
2. **向量设施**：D 确定实际模型/维度/距离/评分策略后，A 实现 pgvector、索引、迁移及真实数据库测试。
   当前不能把内存向量或 SQLite 验证称为 PostgreSQL/pgvector 验证。
3. **超时预算**：公共客户端默认 45 秒，Diagnosis 重试可能超过；A/D 协调等待与模型超时。
4. **样本缺口**：依据 [数据交接](D-data-handoff.md) 和 [数据规范](../../data/README.md)，
   已有 9 份真实来源 JD、21 份合成 JD、10 份合成简历和 40 组人工 baseline；真实学生简历仍为 0。
   A 继续管理授权脱敏简历及缺失方向 JD，D 做样本级分析，不将人工标注当成系统输出或外推整个市场。

## 验证

运行锁定依赖、完整 pytest、全仓 Ruff check/format、统一前端、diagnosis/jobs 模块自检、
范围检查、CI 模式检查和数据校验；不调用收费模型。

本轮实测：锁定依赖同步成功；pytest 104 passed（jobs 28、diagnosis 44、core 32）；
统一前端 32 passed；Ruff check / format check、jobs/diagnosis 模块自检和数据校验通过。
真实浏览器已验证公共壳中的 D 预览；默认导航和最终数据库/真实 AI 仍需 A 集成验收。
