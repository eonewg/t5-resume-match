# T5 团队协作规则

项目：AI 简历诊断与岗位匹配系统。此文件适用于所有角色，不默认将 Agent 指定为 A。

## 先确定角色

优先沿用用户在当前任务明确分配的角色；没有明确分配时，可根据下表中当前分支识别角色。角色与分支不一致时，检查工作区后切换；处于 main 或未知分支且角色未指定时，只询问一次角色，不自行选择 A。

确定角色后必须读取对应角色说明，只执行该角色责任域。

| 角色 | 固定分支 | 角色说明 | 主要责任目录 |
| --- | --- | --- | --- |
| A 架构与集成 | `feat/core-a` | [A.md](docs/roles/A.md) | 公共 core、Schema、模型、路由、根配置、集成文档与测试 |
| B 简历 | `feat/resume-b` | [B.md](docs/roles/B.md) | `backend/modules/resume/`、`tests/resume/` |
| C JD 与匹配 | `feat/jobs-c` | [C.md](docs/roles/C.md) | `backend/modules/jobs/`、`tests/jobs/` |
| D AI 诊断 | `feat/diagnosis-d` | [D.md](docs/roles/D.md) | `backend/modules/diagnosis/`、`tests/diagnosis/` |
| E 数据分析与质量保障 | `feat/analytics-e` | [E.md](docs/roles/E.md) | `backend/modules/analytics/`、`tests/analytics/`、`tests/quality/` |

各角色可修改自己的 `docs/integration_requests/<角色>-*.md`。前端目录是责任预留，公共前端技术栈尚未建立，不各自初始化不兼容的前端工程。

## Git 自动化

Agent 承担所分配角色的 Git 操作，不把普通 Git 命令留给用户。

1. 检查是否为 Git 仓库；不是时获取仓库 URL 后克隆。本项目地址为 `https://github.com/eonewg/t5-resume-match.git`。检查 origin，缺失则添加，指向其他仓库时先核实，不直接覆盖。
2. 执行 `git status --porcelain`。发现不属于当前角色的未提交修改时，停止并说明；不得覆盖、删除、stash 或 reset。保护本角色已有修改。
3. 执行 `git fetch origin`。切换到本角色固定分支：本地已有则 switch，只有远端存在则创建跟踪分支，均不存在则基于 `origin/main` 创建。
4. 新分支基于 main 前，确认 main 已包含 `backend/core/ports.py` 和 `docs/api-contract.md`。尚未合入时遵循 [团队上手说明](docs/team-onboarding.md) 的临时基线办法，不从空 main 开始业务实现。
5. 分支首次创建后立即 `git push -u origin <角色分支>`。每完成一个独立验证的小任务，只 add 本角色允许的文件，自动 commit 并 push；禁止 `git add .`。
6. 交付时说明分支、最新 commit、修改文件、验证结果和未解决事项。

禁止 force push、hard reset、未经允许重写历史、修改其他成员分支、删除其他成员代码来解决冲突。禁止自动合并到 main；创建 PR 与合并是不同动作，合并须明确授权。认证失败、权限不足或合并冲突时停止相关 Git 操作并说明，保留工作区。

## 公共边界与契约

- 只通过公开接口和约定数据结构交互，不直接调用其他成员内部实现。
- 以 [api-contract.md](docs/api-contract.md)、`backend/schemas/contracts.py` 和 `backend/core/ports.py` 为当前公共契约，不在角色文档复制另一套 Schema。
- 全局依赖、根配置、公共前端壳、路由挂载、数据库和 Schema 统一由 A 修改。其他成员将需求写入 `docs/integration_requests/`，说明理由、接口样例和验证方法。
- 不为代码统一重构他人模块。A 优先用 adapter 解决接口差异；公共接口变更记录到契约文档，保持兼容。
- 其他模块未交付时使用明确标注的 Mock 继续开发，不停工等待。禁止将 Mock 或固定分数描述为真实业务结果。
- 成员提供可导入的公开类、依赖清单和测试样例。先检查当前代码与记录是否一致；不能把旧验收记录当成本次验证结果。

## 验证与交付

按改动范围执行有效测试；普通文档改动检查链接、规则一致性和差异，不机械新增业务测试。功能改动验证异常输入、失败回滚和边界条件。保护用户已有文件，清理本次无用途临时文件。

业务模块未接入时准确说明当前交付是模块本身或 Mock 集成。个人报告记录真实发生的接口适配、公共结构决策、Agent 误改问题、冲突及环境差异，不编造案例。
