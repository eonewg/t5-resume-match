# C：岗位与匹配负责人

计划工作量 **18%**。姓名待确认；本页用于职责安排，不追溯认定历史贡献。完整分配见[五人方案](../../T5_FIVE_PERSON_ALLOCATION.md)，协作遵守[团队约定](../team-rules.md)。

## 责任与代码范围

JD 输入与结构化字段、岗位管理、关键词抽取、0–100 匹配分数、技能 gap、embedding 策略与 AI 综合评估。

- `backend/modules/jobs/`、`tests/jobs/`
- `frontend/src/modules/jobs/`、`frontend/src/pages/JobsPage.tsx`、`frontend/src/pages/JobCreatePage.tsx`、`frontend/src/pages/MatchingPage.tsx` 及专属测试
- `docs/matching-assessment.md`、岗位与匹配技术说明

文件归属以[独占范围与交接规则](../../T5_FIVE_PERSON_ALLOCATION.md#3-独占文件范围)为准。只修改自己负责的文件；其他模块与公共文件的需求交给对应负责人实施，不改变公开 provider 名称或运行时接口。

## 验证与交接

验证关键词匹配解释、空输入、重复技能、分数边界及 JD 复用；向 A 提供向量模型/维度/距离要求，向 D/E 提供岗位字段。向量增强不替代关键词基线，真实网络验证单独记录。不修改公共向量存储、外部市场采集、STAR 诊断或 analytics 统计。

按实际工作填写任务、产出路径/提交、验证和剩余问题；不得预填通过。历史验收见[台账](../acceptance.md)，当前任务需提供对应版本证据。
