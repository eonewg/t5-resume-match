# D Level 1 Jobs / Matching 交付与集成请求

开发分支 `feat/intelligence-d`，集成目标 `feat/core-a`。同步基线 `844b89c`，merge `4dd05f9`，无冲突。

## 本阶段

开始时 Diagnosis 已集成且有 44 项离线测试；Jobs 业务和 tests/jobs 缺失，成员自检因此失败。
本阶段实现 JD 原文字面解析、技能/工具提取、独立关键词评分与差距说明，以及公共壳中的 Jobs 前端预览。
复用现有公共 Provider/schema/API 和持久化；没有编辑 A 公共文件、数据库、Resume、Analytics、CI、脚本、依赖或样本。
Diagnosis 不改写。STAR 事实约束、真实失败不冒充 Mock 的既有行为由回归检查覆盖。

公式及边界见 [模块说明](../../backend/modules/jobs/README.md)。输出保持公共 MatchResult：
`resume_id, jd_id, score, matched_skills, missing_skills, gap_analysis`，公共响应添加来源标识等元数据。
规则计算是真实关键词逻辑，不是 AI。Mock 来源保留标识，不显示成可信分数。

## 验证记录（2026-09-07）

- 锁定依赖同步通过；完整 pytest **104 passed**：Jobs 28、Diagnosis 44、core 32。
- 全仓 Ruff check / format check 通过（48 Python 文件）；统一前端 **32 passed**。
- `check_member jobs` 和 `check_member diagnosis` 均通过，包括公共契约/核心回归。
- 数据校验通过：30 JD（9 real_web / 21 synthetic）、10 synthetic 简历、两轮 40 人工配对；真实学生简历仍为 0。
- [样本报告](D-keyword-evaluation.md) 可复现；词表参考同批标注，明确属于样本内验证。
- 真实 Edge 浏览器 + 公共 FastAPI + D 规则 Provider + 内存 SQLite：JD 输入保存/解析、选择简历、33.33%（1/3）及 gap、空状态、502 后重试、Mock 标识、长文本/XSS、390px 无横向溢出、重复导航无重复提交均通过。
- 浏览器中简历为通过公共保存接口写入的合成结构化记录；未验收真实 PDF 解析/AI/PostgreSQL/pgvector。
- Python 仅出现现有 Starlette/httpx/anyio 的两项弃用警告，未改公共依赖。

## 请求 A 处理

1. **主导航集成**：审查验收后在公共模块注册表启用 Jobs，并配置 `T5_JOBS_PROVIDER=backend.modules.jobs.public:JobsService`。
   当前 D 预览路径已真实验证；不能将预览可用描述成默认导航已集成。
2. **后续 JD 字段**：公共 skills 当前承载技能/工具并集。若课程验收需单独持久化 tools、薪资原文/上下界/币种/周期，
   请 A 提供向后兼容 schema/API/存储契约；D 再按契约实现解析和展示。未知薪资不编造或强行折算。
3. **业务验收**：A 审查词表及样本内结果；固定关键词覆盖不是岗位录用预测。补充独立样本后再评估泛化。

本轮没有 pgvector 请求，不新增公共 API、向量字段、索引或依赖。
Embedding 未实现/启用；关键词基线完成业务验收后，再定义模型接口、维度、对象、距离、归一化、组合权重和降级方案并向 A 请求设施。
下一优先级是 A 对 Level 1 基线及默认导航的验收/集成，随后完善待定 JD 公共字段，向量增强排在其后。
