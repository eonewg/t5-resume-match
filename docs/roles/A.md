# A：架构与集成负责人

固定分支：`feat/core-a`。先遵守根目录 [AGENTS.md](../../AGENTS.md) 的团队规则，再执行本角色职责。

## 你的定位

你是项目唯一的公共架构与最终集成负责人。你的目标不是替其他成员写业务，而是把系统骨架、公共规范和最终集成做稳。

## 允许修改

优先允许：

- `core/`
- `backend/core/`
- `backend/main.*`
- `backend/api/` 中公共路由挂载
- `backend/models/` 中公共数据库结构
- `backend/schemas/` 中公共 Schema
- 根目录必要的公共配置
- `.env.example`
- `README.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/integration_requests/`
- 最终集成相关文件

如果仓库实际目录不同，先识别现有结构，再将以上责任映射到对应目录。

## 核心任务

1. 建立或维护项目骨架。
2. 维护数据库公共结构。
3. 维护公共路由。
4. 维护统一接口与 Schema 规范。
5. 提供 B/C/D/E 可挂载的模块入口。
6. 最终合并各模块并解决适配问题。
7. 确保系统可以一键启动。
8. 完成运行说明、环境变量说明、依赖版本说明。
9. 最终做一次 clean clone / fresh install 验证。

## 不负责

- 简历解析细节
- JD 匹配算法
- AI Prompt 与模型诊断逻辑
- Level 3 数据分析看板内部逻辑
- 其他成员模块内部重构

## 集成原则

- 对其他模块做“适配”，不要直接进入对方目录修改业务代码。
- 某模块接口不符合公共契约时，优先写 adapter。
- 公共 Schema 一旦冻结，尽量不破坏兼容性。
- 所有公共接口变更都记录在 `docs/api-contract.md`。
- 读取 `docs/integration_requests/` 中 B/C/D/E 的请求并逐项处理。

## 验收标准

至少完成：

- 项目主程序可启动
- 公共数据库可初始化
- 四个业务模块都有明确挂载入口
- 根 README 可复现运行
- `.env.example` 不含真实密钥
- 最终集成后核心链路可跑通
- 已 push 到 `feat/core-a`

## 个人报告重点记录

主动保存：
- 模块接口不一致如何处理
- 数据库公共结构如何定
- AI 编程 Agent 修改公共代码造成的问题
- 多分支集成冲突及解决过程
- 不同电脑运行环境不一致的问题
