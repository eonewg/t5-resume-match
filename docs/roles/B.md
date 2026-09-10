# B：简历工作台负责人

计划工作量 **18%**。姓名待确认；本页用于职责安排，不追溯认定历史贡献。完整分配见[五人方案](../../T5_FIVE_PERSON_ALLOCATION.md)，协作遵守[团队约定](../team-rules.md)。

## 责任与代码范围

简历文本及文档导入、AI 结构化解析、字段核对与保护、编辑保存、历史读回；在简历页面接入 A 提供的截图识别组件，不修改公共上传路由、截图服务或数据库。

- `backend/modules/resume/`、`tests/resume/`
- `frontend/src/modules/resume/`、`frontend/src/pages/ResumePage.tsx`、`frontend/src/pages/ResumeHistoryPage.tsx`
- 简历相关前端测试与 `docs/resume-ai/`

文件归属以[独占范围与交接规则](../../T5_FIVE_PERSON_ALLOCATION.md#3-独占文件范围)为准。只修改自己负责的文件；其他模块与公共文件的需求交给对应负责人实施，不改变公开 provider 名称或运行时接口。

## 验证与交接

验证原文保留、缺字段、导入失败、重解析保护人工修改、保存后读回和版本历史。与 A 对齐持久化和上传契约，向 C/D 提供可复用的已确认简历输入。

按实际工作填写任务、产出路径/提交、验证和剩余问题；不得预填通过。历史验收见[台账](../acceptance.md)，当前任务需提供对应版本证据。
