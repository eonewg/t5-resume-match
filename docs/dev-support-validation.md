# 开发支持工具与公共前端验收

日期：2026-09-07。代码提交：`646e910`（示例与自检）、`056a570`（公共前端及交接）。这是 A 的开发支持交付，不是 B/C/D/E 业务验收。

## 已完成与验证

| 项目 | 结果 |
| --- | --- |
| 四个公开接入示例 | B/C/D/E 示例命令全部通过，始终标记 Mock |
| 统一合成样例 | UI、HTTP smoke 与成员自检共用 team.json；参考分数不强制真实算法一致 |
| 成员自检 | 检查同步接口、原文/ID、返回结构、样例语义、独立模块测试；D 默认不构造或调用 AI |
| CI | 成员 push 与 PR 纳入检查；成员范围和 PR 目标检查；pytest 发现所有 tests；前端 runner 发现公共和成员测试 |
| 交付模板 | PR 模板与公共集成请求模板已加入 |
| 公共前端 | 一键启动，无生产 Node 构建依赖；导航、API 客户端、状态、四模块 mount/preview 入口 |
| 本地测试 | 25 项 Python 测试、16 项 Node 前端检查全部通过，Ruff 通过 |
| 独立复现 | 从 GitHub 全新 clone A 分支、新建虚拟环境并安装 27 包；重复运行 25+16 项检查及四示例均通过 |
| 实际启动 | fresh clone 默认配置运行 start.ps1，首页与 HTTP 核心流程通过；固定示例配置的 smoke 也通过 |
| 跨平台 CI | [34100867765](https://github.com/eonewg/t5-resume-match/actions/runs/34100867765)，Windows/Ubuntu × Python 3.11/3.13 四组全部通过，Node 22 |

## 浏览器验证

独立临时测试浏览器，无个人浏览器登录状态。验证 1440px 桌面与 390px 窄屏：样例填充、真实 HTTP 提交、Mock 标签及隐藏示例分数、导航返回、502 后保留输入及重试、编辑后隐藏旧结果、成员 preview 入口加载/卸载。无页面 JavaScript 异常，窄屏无整页横向溢出。

内置浏览器工具因缺少运行文件无法启动，使用本机独立 Playwright + Chrome 完成上述检查。preview 验证用公共面板示例作为测试替身，不代表 B 已交付 UI。

## 发现与修正

- 原 pytest 只发现 tests/core，成员测试可能漏跑；改为 tests 并使用 importlib 模式，避免成员测试同名冲突。
- 自定义示例路径原本被认作真实 provider；加入显式 is_mock 标志并验证经过 HTTP 流程仍保留。
- 旧 smoke 脚本另有一份样例，与固定示例不一致；现与公共 JSON 共用，非黄金输入返回明确 Mock 占位。
- 模块导出错误/异步方法在启动或自检阶段发现，避免到用户请求时才失败。

## 限制

无已验收或已集成成员分支。B/C/D/E 真实业务与 UI 仍待交付；自检通过不替代 A 代码审查和业务效果验收。D 的默认自检不验证真实 AI 输出，需成员离线测试与后续有凭证的实测。pytest 有两项上游弃用提示，无失败。

成员范围检查只检查已提交路径与显著本地产物，不是完整密钥扫描器。前端当前选择只在内存保留；重试可能创建新的简历/JD，没有历史选择界面。PostgreSQL/pgvector 未新增实测。个人本地 AGENTS.md 保持忽略，未修改或上传。

## 修改文件

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/core.yml`
- `README.md`
- `backend/core/providers.py`
- `backend/main.py`
- `docs/api-contract.md`
- `docs/architecture.md`
- `docs/dev-support-validation.md`
- `docs/frontend-integration.md`
- `docs/integration_requests/README.md`
- `docs/integration_requests/TEMPLATE.md`
- `docs/member-development.md`
- `docs/roles/B.md`
- `docs/roles/C.md`
- `docs/roles/D.md`
- `docs/roles/E.md`
- `docs/team-onboarding.md`
- `examples/README.md`
- `examples/__init__.py`
- `examples/fixtures/__init__.py`
- `examples/fixtures/team.json`
- `examples/frontend-panel.js`
- `examples/providers/__init__.py`
- `examples/providers/analytics.py`
- `examples/providers/diagnosis.py`
- `examples/providers/jobs.py`
- `examples/providers/resume.py`
- `frontend/index.html`
- `frontend/package.json`
- `frontend/src/app.js`
- `frontend/src/core/api.js`
- `frontend/src/core/modules.js`
- `frontend/src/core/workflow.js`
- `frontend/src/core/workspace.js`
- `frontend/src/styles.css`
- `frontend/tests/api.test.mjs`
- `frontend/tests/discovery.test.mjs`
- `frontend/tests/syntax.test.mjs`
- `frontend/tests/workflow.test.mjs`
- `pyproject.toml`
- `scripts/__init__.py`
- `scripts/check_frontend.mjs`
- `scripts/check_member.py`
- `scripts/check_scope.py`
- `scripts/member_specs.py`
- `scripts/smoke.py`
- `tests/core/test_frontend_shell.py`
- `tests/core/test_member_tools.py`
