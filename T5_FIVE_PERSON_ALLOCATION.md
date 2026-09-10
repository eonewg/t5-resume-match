# T5 五人职责分工与交付方案

本方案按 Vitae 的实际模块安排五个工作包，覆盖需求分析、设计、开发、测试与集成。A–E 为成员占位，姓名待小组确认。工作量百分比表示计划权重，不是已经发生的工时或代码贡献比例；历史实现、提交和验收记录按原始证据保留。

## 1. 总体分配

| 成员 | 角色 | 权重 | 主交付物 | 详细职责 |
| --- | --- | ---: | --- | --- |
| A | 总架构与最终集成 | 35% | 架构、公共契约、数据库、公共壳、CI、部署与集成版本 | [A](docs/roles/A.md) |
| B | 简历工作台 | 18% | 结构化简历、字段保护、编辑保存、历史和导入流程 | [B](docs/roles/B.md) |
| C | 岗位与匹配 | 18% | JD 管理、关键词分数、技能 gap、语义增强与综合评估 | [C](docs/roles/C.md) |
| D | AI 诊断 | 16% | STAR 改写、定向建议、事实保护与错误恢复 | [D](docs/roles/D.md) |
| E | 市场分析 | 13% | 样本口径、市场图表、市场模块测试与数据验证 | [E](docs/roles/E.md) |

A 的 35% 分为总体设计与契约 8%、数据库及向量基础设施 8%、公共前端与模型设置 7%、CI/打包/最终集成 12%。其余成员各自承担模块的前后端、测试和技术说明，A 负责系统级测试与集成，B–E 分别负责自己模块的测试。五人角色映射到四个业务模块及一个公共平台，不为人数额外拆分服务。

## 2. 课程要求与协作接口

| 阶段 | 负责人及协作 | 交付与验收 |
| --- | --- | --- |
| 问题定义 | E 组织竞品与样本，B 提供简历视角，C/D 分析技能与表达差距，A 确认范围 | 至少 2 款竞品、5 份真实 JD、3 份学生简历及痛点分析；脱敏且注明来源 |
| Level 1 简历 | B 主责，A 提供存储和公共 API | 原文导入 → 解析 → 编辑 → 保存 → 读回；缺失值与失败不丢输入 |
| Level 1 岗位/匹配 | C 主责，A 提供公共持久化，B 对接简历 | JD 可复用；0–100 关键词分数、matched/missing 技能和解释一致 |
| Level 2 诊断 | D 主责，B/C 对齐输入 | STAR 与 JD 定向建议；不捏造事实或数字；拒绝、截断、异常有明确恢复路径 |
| Level 3 市场 | E 主责，C 提供 JD 字段，A 提供查询 | 词云、薪资、技能分布和观察文字；明确样本量、来源、日期、缺失值 |
| 平台与发布 | A 主责，各成员回归，A 汇总证据 | 四模块完整链路、数据库验证、构建与运行、可复现命令及剩余问题 |

## 3. 独占文件范围

每个文件只设一个修改负责人；其他成员可以阅读、调用公开接口和提出问题。下表定义现有代码的修改归属，不移动代码、不新增运行时权限。目录内新增文件继承负责人；新共享文件先由 A 明确归属。

| 成员 | 后端独占范围 | 前端独占范围 | 测试与资料 |
| --- | --- | --- | --- |
| A | `backend/main.py`、`backend/api/`、`backend/core/`、`backend/models/`、`backend/schemas/` | `frontend/src/core/`、`components/`、`App.tsx`、`main.tsx`、`pages/HomePage.tsx`、全局 CSS、assets、demo | 公共/跨模块测试、`tests/conftest.py`、scripts、examples、CI、依赖/构建配置、架构/API/集成文档 |
| B | `backend/modules/resume/` | `frontend/src/modules/resume/`、`pages/ResumePage.tsx`、`pages/ResumeHistoryPage.tsx` | `tests/resume/`、简历专属前端测试、`docs/resume-ai/` |
| C | `backend/modules/jobs/` | `frontend/src/modules/jobs/`、`pages/JobsPage.tsx`、`pages/JobCreatePage.tsx`、`pages/MatchingPage.tsx` | `tests/jobs/`、岗位/匹配专属前端测试、匹配算法说明 |
| D | `backend/modules/diagnosis/` | `frontend/src/modules/diagnosis/`、`pages/DiagnosisPage.tsx` | `tests/diagnosis/`、诊断专属前端测试、诊断评估说明 |
| E | `backend/modules/analytics/` | `frontend/src/modules/analytics/`、`pages/AnalyticsPage.tsx` | `tests/analytics/`、市场专属前端测试、`data/market/`、市场样本与统计口径说明 |

表中前端 `components/`、`pages/` 等缩写均相对 `frontend/src/`。业务模块负责人在自己的页面中组合公共组件，不直接修改公共组件、全局 CSS、共享状态或 API 客户端。模块新增样式放在自己的模块目录；修改全局样式由 A 实施。

前端测试按被测对象归属：仅覆盖一个业务模块的测试由该模块负责人维护；`react-pages.test.tsx`、`workflow.test.mjs`、`product-shell-smoke.cjs` 等覆盖多个页面或完整流程的测试归 A。现有测试文件不拆分、不多人同时修改；模块负责人向 A 提供需要补充的跨模块场景。脚本统一由 A 维护，B–E 可直接运行并提交结果。

## 4. 容易交叉的功能边界

| 功能 | 唯一实现责任与交接 |
| --- | --- |
| API、保存与历史 | A 维护路由、Schema、数据库与事务；B 实现简历字段编辑及历史页面，C 实现岗位页面；B/C 通过 API 保存和读取，不改公共存储 |
| 截图与文档导入 | A 维护公共截图服务、上传路由和 `ScreenshotImport`；B 维护简历文档解析及简历页面接入，C 维护岗位页面接入；公共识别问题由 A 修复 |
| AI 配置与业务调用 | A 维护设置页、配置存储、provider 装配；B/C/D 只维护各自模块的请求构造、输出解析和业务校验，不另建设置系统 |
| 匹配与诊断 | C 输出关键词分数、matched/missing、语义结果与匹配评估；D 消费已确认简历/JD，输出 STAR 和定向建议，不修改评分算法；C 不实现 STAR 改写 |
| 向量能力 | C 决定 embedding 模型、维度、距离、缓存使用及评分；A 维护 `core/vectors.py`、数据库迁移和查询接口；C 只通过公开 port 存取向量 |
| 外部岗位与市场 | A 维护 `core/external_jobs.py`、`core/china_jobs.py`、`core/market_samples.py` 及公共入库/查询；C 维护用户录入 JD 的解析；E 消费提供的 JD 数据做统计、图表与口径验证，不重复实现采集或 JD 解析 |
| 公共图表组件 | `MarketOverview`、`SalaryDetails` 等 `components/` 文件仍由 A 维护；E 负责市场页面与统计输出，需要公共组件变化时交给 A |
| 测试与集成 | B–E 各自维护模块测试并修复本模块缺陷；A 维护公共与系统 E2E、CI、数据库/安装验证，汇总结果并集成；E 不承担其他模块的测试组织工作 |

## 5. 接口交接方式

1. 负责人提交自己的代码、模块测试、输入/输出示例和未解决项；公开输入输出以 `backend/core/ports.py` 与共享 Schema 为准。
2. 需要改别人的文件时，在集成请求中写明目标文件、当前问题、期望行为、字段示例和验证方式；由该文件负责人修改并返回提交。
3. A 负责公共契约变更和接入顺序，先对齐接口，再由受影响成员更新各自模块；联调发现问题按文件归属交回修复。
4. A 执行最终合并与系统回归。代码评审不改变文件归属；不得以“配合联调”为由让两人同时维护同一文件。

## 6. 任务记录模板

每位成员在认领与完成工作时填写以下表格，可涵盖后续补充开发、复核和测试；不要补造过往开发日期或提交归属。

| 成员姓名 / 角色 | 具体任务 | 产出路径或提交 | 实际完成日期 | 验证结果与证据 | 剩余问题 |
| --- | --- | --- | --- | --- | --- |
| 待填写 | 待认领 | 待提交 | 待完成 | 待验证 | 待确认 |

## 7. 交付规则

按[团队约定](docs/team-rules.md)从当前基线开展工作，各模块提交契约、自测、实际效果与未验证项，A 组织最终集成并汇总验收证据。单元测试、离线替身、真实数据库、真实模型和浏览器验证分别记录，不互相替代。课程要求以[严格需求对照表](T5_REQUIREMENTS_MATRIX.md)为准。
