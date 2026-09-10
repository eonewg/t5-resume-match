# A：总架构与最终集成负责人

计划工作量 **35%**。姓名待确认；本页用于职责安排，不追溯认定历史贡献。完整分配见[五人方案](../../T5_FIVE_PERSON_ALLOCATION.md)，协作遵守[团队约定](../team-rules.md)。

## 责任与代码范围

总体设计、公共 API/Schema/ports、数据库与 pgvector、前端公共壳、模型设置、CI、打包和最终集成。协调模块间依赖，终审技术文档。

- `backend/main.py`、`backend/api/`、`backend/core/`、`backend/models/`、`backend/schemas/`
- `frontend/src/App.tsx`、`frontend/src/core/`、公共组件、全局样式与设置入口
- `tests/core/`、公共脚本、依赖配置、`.github/`

共享文件变更与 A 协调，目录归属用于协作审查，不改变公开 provider 名称或运行时接口。

## 验证与交接

核验事务与契约、数据持久化、PostgreSQL/pgvector、公共设置、构建及完整业务链路；根据变更范围组织全新安装验证。各成员负责模块自测，E 汇总记录，A 判断集成是否满足门槛。

按实际工作填写任务、产出路径/提交、验证和剩余问题；不得预填通过。历史验收见[台账](../acceptance.md)，当前任务需提供对应版本证据。
