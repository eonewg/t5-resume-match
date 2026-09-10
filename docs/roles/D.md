# D：AI 诊断负责人

计划工作量 **16%**。姓名待确认；本页用于职责安排，不追溯认定历史贡献。完整分配见[五人方案](../../T5_FIVE_PERSON_ALLOCATION.md)，协作遵守[团队约定](../team-rules.md)。

## 责任与代码范围

STAR 内容增强、JD 定向建议、量化补充提示、事实保护、结构化输出校验与诊断失败恢复。

- `backend/modules/diagnosis/`、`tests/diagnosis/`
- `frontend/src/modules/diagnosis/`、`frontend/src/pages/DiagnosisPage.tsx` 与相关测试
- 诊断模块说明及模型评估材料

文件归属以[独占范围与交接规则](../../T5_FIVE_PERSON_ALLOCATION.md#3-独占文件范围)为准。只修改自己负责的文件；其他模块与公共文件的需求交给对应负责人实施，不改变公开 provider 名称或运行时接口。

## 验证与交接

验证 STAR 和定向建议、缺少事实时提示补充、内容拒绝/截断/异常处理。与 B/C 对齐简历/JD 输入，与 A 对齐供应商设置；不修改 C 的匹配评分、B 的简历编辑或 A 的配置存储。不编造数字，不以 Mock 替代真实成功。

按实际工作填写任务、产出路径/提交、验证和剩余问题；不得预填通过。历史验收见[台账](../acceptance.md)，当前任务需提供对应版本证据。
