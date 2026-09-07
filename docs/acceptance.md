# 模块验收与集成台账

## 当前状态

2026-09-07：按两人分工迁移验收单位。已检查当前 A 代码与远端引用：本次迁移前 A 为 `e2ece4e`，远端有 main、feat/core-a、历史 feat/diagnosis-d；尚无 feat/intelligence-d。本次只更新规则、文档和自检/CI，不实现新的业务功能。

| 模块 | Owner / 新开发分支 | 当前证据 | T5 完整验收状态 / 下一步 |
| --- | --- | --- | --- |
| resume | A / feat/core-a | 公共结构化保存、读取 API；无真实模块目录 | 待实现解析、编辑 UI 与保存读取闭环，待验收 |
| jobs/matching | D / feat/intelligence-d | 公共接口与 Mock；无真实模块目录 | 待交付关键词基线、技能/gap、薪资解析及向量增强 |
| diagnosis | D / feat/intelligence-d | 历史 16802ad PASS，80d4f55 合并、93e1b12 适配 | 已集成历史交付；真实模型和严格 T5 全项仍待验证 |
| analytics | A / feat/core-a | 公共基础统计接口与 Mock；无真实模块目录 | 待交付已录入 JD 的词云、薪资/技能分布和观察说明 |

历史 diagnosis PASS 保留原结论，不覆盖 jobs 或尚无证据的严格版能力。B/C/E 不再是待提交成员。本次不新验收、不新集成成员分支，也不合并 main。旧验证记录见 [validation](validation.md) 和 [开发支持记录](dev-support-validation.md)，仅代表其当时范围。

## 最终系统门槛

所有项目均需准确提交、命令/步骤、实际结果和证据位置；未执行写“待验证”，不预填 PASS。

| 门槛 | Owner | 当前差距 / 所需证据 |
| --- | --- | --- |
| 问题定义 | A 汇总、D 分析 | 至少 2 款招聘 APP 对比、5 份真实 JD、3 份学生简历，脱敏、来源与表达/技能 gap；痛点报告待提交验收 |
| Level 1 resume | A | 原文粘贴→解析→结构化展示→编辑→保存→重新读取；缺失字段留空 |
| Level 1 jobs/matching | D，A 提供持久化 | JD 输入保存复用、技能/工具提取、关键词基线、0–100 分数、matched/missing/gap 及一致解释；只有向量评分不通过 |
| Level 2 | D，A 串联 | 平淡经历 STAR、JD 定向关键词/经历建议、量化补充提示、不虚构事实；真实/Mock 与失败行为区分；真实模型待验证 |
| Level 3 | A，D 解析 JD | 已录入 JD 聚合的近期技能词云、薪资分布、技能要求分布、观察/职业建议；来源、样本量、时间范围和缺失值口径 |
| PostgreSQL + pgvector | A，D 提供参数 | 实际连接、扩展、字段、索引、向量读写/查询 adapter、迁移和真实集成测试；目前 SQLite 演示不足以通过 |
| NLP 与向量 | D | 关键词规则基线与向量相似度增强、组合评分解释；模型、维度、距离请求待明确 |
| 全链路演示与 E2E | A/D | 按 T5 对照表十步演示，包括原始/优化简历对比、全部图表；无未解释关键失败 |
| 可复现运行 | A | 主程序、数据库初始化、完整依赖安装、README、无密钥 .env.example；最终提交的 clean clone / fresh install |
| AI 过程与设计材料 | A/D | 真实需求拆解、架构/Schema/API、编码、测试审查、文档/演示复盘；原型工具采用情况如实说明 |
| 最终合并 | A | 四模块完整 PASS、全部集成、完整测试通过且 A 已 push；仅 feat/core-a → main PR，合并后复核启动/核心链路 |

## 每次验收记录

记录日期、模块、owner、源分支与准确 SHA、A 基线、文件范围、越界/误提交检查、契约检查、测试及复现、未验证项、结论和下一步；集成后补充集成提交和回归证据。

- PASS：该准确提交在声明范围内通过，可集成。
- BLOCKED：业务错误、越界等必须修复，给出文件、复现和预期。
- ADAPT：需 A 公共适配，复验 PASS 后才能集成。
- 待实现/待验收：尚未执行验收，不冒充 BLOCKED 或 PASS。

更新提交后重查变化；集成失败保留证据并停止后续合并。

## 验收记录

### 2026-09-07 · A 验收 D（feat/diagnosis-d @ `16802ad`）— PASS

- 基线：A 检查时 `feat/core-a` @ `c209eb0`；成员分支含 3 个提交（`d1e030a` 实现、`9529e3a` 文档验证、`16802ad` 同步 main）。
- 变更范围：20 个文件全新增（+1337 行），限于 `backend/modules/diagnosis/`、`frontend/src/modules/diagnosis/`、`tests/diagnosis/`、`docs/integration_requests/D-integration.md`；未修改任何公共文件或其他成员目录。
- 越界检查：通过。无 `core/`、公共 Schema、公共主路由、根配置修改。
- 误提交检查：通过。无 API Key、无 `.env`、无构建产物与临时调试文件；最大文件为测试 `tests/diagnosis/test_diagnosis.py`（约 11.6KB）。
- 契约检查（对照 `docs/api-contract.md` v1）：`DiagnosisService` 可无参构造，同步 `diagnose(DiagnosisInput) -> DiagnosisResult`，输出保持 `summary + suggestions`（STAR/岗位/关键词/风险以标签写入 suggestions）；复用公共 `backend/schemas/contracts.py`，未另起 Schema；未配置密钥时抛 `ConfigurationError`，不冒充 Mock；Mock 仅离线演示，不会在真实调用失败后自动兜底；错误消息不回显上游内容。前端模块仅依赖公共 API 与 workspace，响应校验符合契约，Mock 标签清晰。
- 测试（本地检出 `16802ad`）：`uv sync --locked` 正常；`pytest -q` 69 passed（D 44 + core 25）；`ruff check` / `ruff format --check` 通过；`node scripts/check_frontend.mjs` 24 passed；`scripts.check_member D` PASS。CI（PR #4，4 个 job：Ubuntu/Windows × Python 3.11/3.13）全绿。
- 未覆盖：真实 DeepSeek Key 的端到端诊断（需团队配置密钥，D 已声明当前不算真实模型验证）；浏览器 smoke 脚本需 Playwright（未入根依赖，采用 D 分支自验记录）。
- 已知非阻塞事项：Starlette `httpx`/`anyio` 弃用 warning ×2，属根依赖层，由 A 在公共层处理（成员请求第 5 点）。
- 结论：**PASS**，允许集成。
- 集成时 A 待办：① `.env.example` 增补 `T5_DIAGNOSIS_PROVIDER`、`DEEPSEEK_API_KEY`（留空）、`T5_DIAGNOSIS_MODEL`；② 前端公共注册表将 diagnosis 从 preview 转正式挂载；③ 真实联调前统一公共 API 客户端 45s 超时与诊断重试上限（30s×最多 5 次）的匹配；④ 处理 Starlette 弃用依赖提示后复验。

### 2026-09-07 · A 集成 D — 完成

- 合并：PR #4 以 merge commit `80d4f55` 合入 `feat/core-a`；合并前将 PR 从 draft 转为 ready。
- 集成回归：pytest 69 passed、`ruff check` 通过、`check_frontend.mjs` 24 passed / 0 failed。
- 公共层适配（`93e1b12`）：`.env.example` 增补 D 真实诊断配置示例（密钥留空）；`frontend/src/core/modules.js` 将 diagnosis 槽位从 preview 转正式挂载；README 环境变量表补充 `DEEPSEEK_API_KEY`、`T5_DIAGNOSIS_MODEL` 及 D 模块 README 链接。
- 浏览器实测（本地 uvicorn + 公共壳）：`#diagnosis` 正式加载 D 模块（无占位页）；工作台创建演示简历与岗位后，D 页面正确读取关联 ID 并执行诊断；Mock 标签、Provider 状态显示正常，控制台无错误。
- 待办 ①② 已完成；③ 留待真实 Key 联调时处理；④（Starlette 弃用提示）由 A 另行处理根依赖。
- 未验证：真实 DeepSeek 模型输出质量与延迟（需配置密钥）。
