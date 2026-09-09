# PR #8 合并后的 fresh install

2026-09-08 从 GitHub 单独 clone `feat/core-a`，准确提交 **a41a31d22dac3b31cb7cac8303f63cdd799ecab4**；其双亲为 A 适配 `5a50ca408cdf721e073564c0094ccd22a7d29a24` 与 D UI head `828dc948767e64d28c2b6dc9450bd11162331910`。技术安装、完整测试及浏览器链路 **PASS，真实模型首次临时失败、显式重试成功**。main 未合并。

## 干净环境边界

- 路径 `.verification/fresh-install` 为独立 GitHub clone，初始工作树干净，无 .env、.venv、数据库或前端编译产物。
- Python 3.13.5，`uv sync --locked` 使用该 clone 新建的 .venv 和空 `.verification/uv-cache`，下载并安装 32 个包；未复用 A 的 Python 环境。一次 Windows 文件重命名短暂拒绝后 uv 自行重试成功，未改锁文件。
- 使用主机已有 PostgreSQL 17.6 / pgvector 0.8.1 二进制服务，新建独立数据库 `t5_fresh_20260908_1421`。初始 public 表数量为零，执行两次幂等迁移，创建 vector 扩展与全部表。不是全新操作系统或重新编译 PostgreSQL。
- 前端为原生 ES modules/CSS，由 `backend.main:app` 提供；不需要 npm build 或单独前端服务。验收浏览器复用主机已安装 Edge/Playwright，仅为 QA 工具，不是应用依赖。
- 普通应用在 127.0.0.1:8772 启动，未使用 product_browser_server 或测试路由替代正式生命周期。真实模型配置仅从用户既有 .env 读取至该进程环境，不复制 .env 到新 clone、不输出凭据。

## 检查结果

| 项目 | 实际结果 |
| --- | --- |
| 完整 Python | 396 passed、0 skipped，23.32 秒；两条既有 Starlette/anyio 弃用提示 |
| frontend 全量 | 57 passed、0 failed |
| Ruff | check 全部通过；扩大 format 检查至整个仓库，147 文件通过 |
| 范围 / 四模块公开接口 | A/main scope gate、Resume/Jobs/Diagnosis/Analytics 契约通过；Diagnosis 契约检查为离线 |
| PostgreSQL / pgvector | 扩展、迁移、索引、向量写入/查询、Resume → JD → keyword match smoke 通过 |
| GitHub CI | 合并提交运行 34237691949 SUCCESS，四系统/Python组合与 PostgreSQL job 均通过 |
| 真实完整浏览器 | 首次上游 TemporaryLLMError → HTTP 502；第二次 53.757 秒、is_mock=false、STAR/JD 建议通过 |
| 真实/演示及失败状态 | 真实失败未降级；受控 502 清结果、重试读取真实缓存；默认演示有明确标识，503/演示 fixture/快捷流程通过 |
| Desktop / 390px | 五页导航、保护/重解析/保存、33.33% 匹配、诊断对照、来源/薪资缺失、XSS 纯文本与无页面溢出通过 |
| 刷新 / 重启持久化 | 重启前后 18 条 Resume/JD/Match/Diagnosis API 记录逐项一致；390px 刷新两轮载入确认字段与原文一致 |

首次失败完整保留在 [attempt 1](evidence/fresh-live-attempt-1.json)；重试结果见 [attempt 2](evidence/fresh-live-attempt-2.json)。两次外层真实调用尝试一失败一成功，不能写成首次全通过，也不将服务内部重试计作独立质量样本。其他证据：[UI](evidence/fresh-ui-browser.json)、[持久化](evidence/fresh-persistence.json)。UI fixture 不属于真实模型证据。

## 复现路线

1. 按 README clone A 并 `uv sync --locked`，数据库按 docs/postgres.md 启动；为验收创建独立空库，设置 T5_DATABASE_URL/T5_TEST_DATABASE_URL。
2. 执行 `uv run --locked python -m scripts.migrate` 两次，运行完整 pytest、Ruff、`node scripts/check_frontend.mjs` 与 `python -m scripts.smoke_postgres`。
3. `python -m scripts.import_final_samples --apply` 导入补充五份；在同一数据库用普通 `python -m uvicorn backend.main:app` 启动，配置真实 Diagnosis。
4. 安装 QA 所需 Playwright/Edge，设置 T5_SMOKE_URL/T5_RUN_LIVE_BROWSER，运行 `node tests/core/final-live-smoke.cjs`。首次运行要求尚未导入 Canonical 五份，脚本会通过界面导入；若已导入，使用新的验收数据库，不能删除原断言。
5. 记录各 API 返回值，停止并重启同一数据库应用，将 path → JSON 快照路径传入 T5_PERSISTENCE_SNAPSHOT，运行 `node tests/core/fresh-persistence-smoke.cjs`。持久化验证不重新生成模型内容。
6. 改为显式演示配置启动，运行 `node frontend/tests/ui-smoke.cjs`，验收演示、受控失败与两种宽度。

本机临时驱动仅负责选定新库、进程环境与启动普通入口；不属于产品功能。最终文档收尾提交不改变本次验证的 backend/frontend/依赖/数据库实现。安装通过不能替代 [AI 质量](ai-evaluation-results.md) 或 [两款竞品实际体验](../competitor-analysis.md)的缺失证据。
