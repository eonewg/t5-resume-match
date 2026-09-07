# 成员验收与集成台账

## 当前状态

2026-09-07 检查远端：main、feat/core-a、feat/diagnosis-d。D 分支已验收（PASS）并完成集成；B/C/E 尚未提交远端分支。PR #4（feat/diagnosis-d → feat/core-a）已按规则修正 base 分支。

| 成员 | 分支 | 待验收提交 | 结论 | 集成提交 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| B | `feat/resume-b` | — | 待提交 | — | 实现公开简历入口并提交模块测试 |
| C | `feat/matching-c` | — | 待提交 | — | 实现 JD 与匹配公开入口 |
| D | `feat/diagnosis-d` | `16802ad` | PASS | `80d4f55`（合并）/ `93e1b12`（适配） | 待真实 Key 联调 |
| E | `feat/analytics-qa-e` | — | 待提交 | — | 实现分析公开入口及质量验证 |

现有 Mock 验证记录见 [validation.md](validation.md)，不能替代真实成员模块验收。PR #1 为用户明确授权的公共基线合并，最终系统交付仍须完成四成员验收及联调。

## 每次验收记录

每次在本文件追加：日期、角色、成员分支与准确 SHA、当前 A 基线、变更范围、越界/误提交检查、公开契约检查、测试命令与结果、问题文件与复现方式、结论和下一步。通过集成后补充集成提交及验证证据。

- PASS：该准确提交验收通过，可以集成。
- BLOCKED：成员业务问题或越界变更等尚未解决，列出需成员修复的具体内容。
- ADAPT：需要 A 公共层适配，完成并复验为 PASS 后再集成。

成员更新提交后重新检查变化，不将旧结论直接用于新 SHA。集成失败保留记录，停止后续模块合并。

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
