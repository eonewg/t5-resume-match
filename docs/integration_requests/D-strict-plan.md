# D 严格版：需求、差距与公共集成请求

本次为开发约定与文档更新，不是新增 jobs/embedding 功能交付。
基线：`origin/feat/core-a` 的 `e2ece4e`；新分支 `feat/intelligence-d`；PR 目标 `feat/core-a`。
历史 PR #4 已被 A 合入 core-a；旧 `feat/diagnosis-d` 不再继续开发。

## 依据与优先级

- [优化后 Agent 约定](D-agent-policy.md)（仓库根本地 AGENTS.md 的共享副本）
- [用户需求矩阵原文](D-requirements-matrix.md)
- [用户两人分工原文](D-two-person-allocation.md)

上述两份原文完整保留，未将两名开发 owner 等同于两人课程小组。
本轮实际工作是明确 D 的新责任、分支、开发顺序与验收证据，不改公共基础设施。

## 可执行开发顺序与当前状态

| 阶段 | 对应 T5 | D 交付及验收证据 | 当前状态 |
| --- | --- | --- | --- |
| 1 | Level 1 JD 输入 | JobsService.parse；保留 JD 原文、技能/工具、可确认岗位字段；前端公共 API | 未实现 jobs；公共 JD API 已有，不能当成解析业务已完成 |
| 2 | Level 1 关键词匹配 | 唯一关键词交集/分母、0–100、matched/missing、解释；全/部分/无匹配及异常测试 | 未实现真实 JobsService；现有示例/Mock 不计验收 |
| 3 | Level 2 内容增强 | STAR 原文/优化/理由、缺失成果提示、事实边界测试 | diagnosis 已有代码及离线测试；真实模型效果未验证 |
| 4 | Level 2 JD 定向优化 | 关键词、已有经历、技能/表达 gap、成果补充位置与方法 | 已有建议结构；需针对新细分项增加样本验收，不能仅凭 JSON 合法认定质量达标 |
| 5 | 向量匹配增强 | 实际 embedding 接口、模型/版本/维度、距离与归一化、组合公式、可解释降级 | 未实现；模型/维度/组合权重待定，不能编造参数 |
| 6 | Level 3 数据支持 | title/skills/tools/salary/raw_text；薪资来源、范围、周期与未知值 | tools/salary 的公共契约与持久化待 A；D 后续补解析 |
| 7 | 问题定义 | 对至少 5 个真实 JD、3 份学生简历的技能/表达 gap，匹配样例与局限 | 本次未收到真实脱敏样本；已有合成样本不能替代 |
| 8 | 最终演示 | 与 A 的编辑器、保存、关键词匹配、诊断、市场分析联调 | 未完成全系统真实验收；PostgreSQL/pgvector 由 A 落地并真实验证 |

关键词基线拟采用 `100 × |简历关键词 ∩ JD关键词| / |JD关键词|`，先归一化再去重。
这是后续实现候选公式，不是当前已有代码；无关键词时显示无法评估，不解释为 100% 匹配。
向量方案必须保留该基线，最终模型/维度和权重由 D 实现时给出；基础设施由 A 按确定后的参数接入。

## A 需要调整的公共开发支持

| 公共事项 | 当前事实 | 请求（不由 D 直接修改） |
| --- | --- | --- |
| 分支与 owner 映射 | scripts/member_specs.py 把 D 绑定 feat/diagnosis-d 和单个 diagnosis | 支持 feat/intelligence-d 同时检查 jobs、diagnosis 公开入口和两套测试 |
| 范围检查 | check_scope D 仅允许 diagnosis；无法正确审核 jobs 责任 | 为新 D 允许两模块的 backend/frontend/tests 及 D-* 文档，保留敏感文件防护 |
| CI 分支 | workflow push 分支列表没有 feat/intelligence-d；check_member --ci 对新分支报未知 | 将新分支纳入触发和检查，不把“没有运行”当成通过；保留旧分支历史兼容由 A 决定 |
| 公共团队说明 | docs/roles/D.md、member-development、onboarding 等仍描述五人 owner | A 同步两人开发分工，保留四业务模块与课程正式小组信息 |
| JD 公共契约 | JDData 当前有 title/company/jd_text/skills，暂无 tools、salary、raw_text 别名 | A 设计向后兼容字段与映射；D 负责解析，A 负责保存、读取和 analytics 使用 |
| 向量设施 | 本次无真实 embedding/pgvector 证据 | 待 D 确定模型/维度后 A 实现向量列、索引、查询、迁移及真实集成测试 |
| 共享请求时限 | 公共前端默认 45 秒，诊断重试可能更久 | A 与 D 协调超时预算及用户体验；不调整规则掩盖失败 |
| 样本/报告 | 本次材料只提供需求与分工 | A 管理脱敏真实样本、竞品体验记录和痛点报告，D 提交样本级 gap 结论 |

建议 A 的 JD 字段设计包含 tools 列表，以及可空 salary 对象（原文、上下界、币种、周期、
是否可比较）；这是请求而非已定公共 API。保留 jd_text，是否另设 raw_text 由 A 统一决定。
不能把“面议”、年薪、日薪、含奖金薪资在缺乏依据时转换成同一月薪数值。

## 自检与状态表达

本次只更改 D 文档与本地指令。运行锁定依赖、现有完整 pytest、Ruff/format、统一前端检查，
并运行现有 diagnosis/core 成员自检。新 jobs 专项和 jobs 浏览器 smoke 无实现，标为待开发。
新分支 `check_member --ci` 的映射限制应实际复现并记录，不修改公共脚本绕过。
旧 `check_member D` 通过仅代表已有 diagnosis，不代表新 D 双模块完成。
需求矩阵中的数据库、样本、Level 3 等最终条件不因当前测试通过而改变状态。

本轮实测：`uv sync --locked` 成功；pytest 69 passed（diagnosis 44、core 25）；
全仓 Ruff check / format check 通过；统一前端 24 passed；旧 `check_member D` 通过。
设置 `GITHUB_HEAD_REF=feat/intelligence-d` 后，`check_member --ci` 实际失败：
`未知成员分支 feat/intelligence-d，请使用团队约定的分支名`。
这是公共映射待适配，未绕过或声称全绿。本次无业务/UI 变更，没有重新进行浏览器或付费模型验收。
四份优化指令副本 SHA-256 一致；需求矩阵/两人分工的共享副本与用户原文逐字一致。

## 与旧文档的关系

[D-integration.md](D-integration.md) 保留为诊断历史交付记录，
其 PR 指向 main 的特殊请求已失效；新工作固定向 core-a 交付。
A 已通过 `93e1b12` 注册 diagnosis 公共页面并提供配置说明，不能继续把这两项列为尚未实现。
