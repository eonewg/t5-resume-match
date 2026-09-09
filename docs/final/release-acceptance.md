# 最终集成验收计划（Release / QA）

2026-09-09 起草。适用分支 `feat/core-a`；本文档是执行清单，不是验收结论。当前基线 `2746ca4`（含 PR #10/#11/#12），**A1 的 Resume AI simplify 尚未合入**：在包含 A1 的新 commit SHA 上重跑本清单之前，不得把任何结果记录为"最终验收通过"，PR #9 保持草稿，不合 main。

旧基线证据对应关系（只作参照，不可沿用结论）：

| 材料 | 基线 | 状态 |
| --- | --- | --- |
| [fresh install](fresh-install.md) | a41a31d（PR #8 后） | 技术安装 PASS；不含 #10/#11/#12/A1 |
| [Resume AI 五样本一次性验收](../resume-ai/evaluation-results.md) | 0545b26（旧 guard） | 0/5 通过、全部 guard 拒绝；**对应旧实现，A1 simplify 后必须重新真实复测，不得冒充新版本结果** |
| [补充 STAR 验证](star-supplement.md) | ac952ff（旧超时配置） | S1/S2 均失败（93.133/94.140s）；PR #11 改超时后：S1 仍真实 read timeout，S2 已有一次真实成功（2026-09-09 线程状态，仓库证据待本次 E2E 补记） |
| [交付状态](delivery-status.md) | a41a31d | "产品代码不再变化"的表述已被 #10/#11/A1 取代 |

## 1. 前置条件

- 全新 clone `feat/core-a`（`.verification/fresh-install-<date>`），工作树干净，无 .env、.venv、数据库文件、前端产物；不复制 .env 进 clone。
- Git、Python 3.11–3.13（已验证 3.13.5）、uv、Node 22（仅 QA 脚本用）、Playwright + Edge（仅 QA 工具，非应用依赖）。
- PostgreSQL 17 + pgvector 0.8.1：二选一——`compose.yaml`（docker）或 `scripts/local_postgres.ps1`（原生 Windows，127.0.0.1:55432，见 [postgres 文档](../postgres.md)）。为验收创建**独立空库**，设置 `T5_DATABASE_URL` / `T5_TEST_DATABASE_URL`（同库或独立测试库，按 [postgres 文档](../postgres.md) 测试隔离约定）。
- 真实 AI 配置只从用户既有 .env 读入启动进程环境：Resume 走 `T5_RESUME_LLM_*`，Diagnosis 走 `T5_DIAGNOSIS_*`；不输出凭据。真实模型调用需用户明确授权并记录调用次数；授权用尽即停止，不重跑挑成功。
- 服务端超时口径（PR #11 后）：Diagnosis `total_timeout_seconds=95s` 上限、`max_attempts` 默认 2；Resume 单次请求 `T5_RESUME_LLM_TIMEOUT` 默认 30s（上限 120s）、客户端等待上限 150s、无自动重试。公共 API 客户端时限与模块预算的匹配在 E2E 中复核。

## 2. 阶段一：安装与静态验证

按顺序执行并记录实际数字（不预设具体 passed 数）：

| # | 命令 | 通过标准 | 记录 |
| --- | --- | --- | --- |
| 1.1 | `uv sync --locked`（空 uv 缓存） | 安装成功，不改锁文件 | 包数 |
| 1.2 | `uv run --locked python -m scripts.migrate`（执行两次） | 幂等，vector 扩展与全部表建立 | 首次/二次输出 |
| 1.3 | `uv run --locked pytest -q`（T5_TEST_DATABASE_URL 指向 PG） | 0 failed；vectors/PG 用例不得 skip | passed/skipped 数 |
| 1.4 | `uv run --locked ruff check backend tests scripts examples` + `ruff format --check`（同范围） | 全部通过 | — |
| 1.5 | `node scripts/check_frontend.mjs` | 全部通过 | passed 数 |
| 1.6 | `uv run --locked python -m scripts.smoke_postgres` | 扩展/迁移/索引/向量/Resume→JD→keyword match 通过 | — |
| 1.7 | `uv run --locked python -m scripts.check_member --ci`（`GITHUB_REF_NAME=feat/core-a`） | 四模块契约通过（Diagnosis 离线） | — |
| 1.8 | GitHub Actions：该 SHA 的 push run | 全部 job success | run URL |

## 3. 阶段二：普通应用启动与 API 冒烟

1. `uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port 8772`（普通入口，不用测试服务器）。
2. `uv run --locked python scripts/smoke.py http://127.0.0.1:8772`：`/health`、四模块链路、`is_mock` 标记如实返回。
3. `/api/v1/modules` 记录四模块 `is_mock`：演示/真实配置必须与界面标识一致。

## 4. 阶段三：浏览器流程（1440 / 1280 / 390）

自动化（Diagnosis/Resume-AI 失败路径为显式 fixture，不算模型质量证据）：

| # | 命令（另开终端设 `T5_SMOKE_URL`） | 覆盖 |
| --- | --- | --- |
| 4.1 | `node frontend/tests/task-flow-smoke.cjs`（ui-smoke.cjs 同入口） | 三宽度主流程、无横向溢出、单一主按钮、五页导航 |
| 4.2 | `node frontend/tests/resume-ai-recovery-smoke.cjs` | 上传失败 UX：504/503 → 显示原文、"重新识别/手动填写"，重试提交现有原文不重传 |
| 4.3 | `node frontend/tests/polish-smoke.cjs`、`resume-ai-smoke.cjs`（后者消耗真实 Resume 调用，见其头部说明） | polish 回归 / 上传→真实 AI 抽取断言 |

人工核对（对照 [演示脚本](demo-script.md)）：五页导航、上传拖放、字段保护与重解析建议采用、390px 底部导航与表格滚动、无页面级报错。每项记录截图或勾选。

## 5. 阶段四：持久化

1. 记录重启前 API 快照（resume/jd/match/diagnosis 各若干条，含原文与确认字段）到本地 JSON。
2. 停止并重启同一数据库的普通应用。
3. `T5_PERSISTENCE_SNAPSHOT=<快照路径> node tests/core/fresh-persistence-smoke.cjs`：逐路径 deep-equal，刷新两轮载入一致。持久化验证不重新生成模型内容。

## 6. 阶段五：真实产品 E2E 主流程（人工 + 浏览器，消耗真实 AI）

主流程（每步记录实际耗时/结果，失败如实记录不重跑美化）：

1. **上传/粘贴简历**：粘贴 `tests/resume/fixtures/stefano-user.txt` 或上传 PDF/DOCX/TXT（fixtures 在 `frontend/tests/fixtures/`）；确认上传预览不落库、失败时原文返还上传者。
2. **AI 结构化**：点"整理简历内容"；返回四字段草稿 + 原文完整保留。**逐项核对姓名/教育/技能/经历与原文**（A1 simplify 后必须重新真实验证；旧 guard 的五样本结果不适用新版本）。
3. **用户核对**：修改至少一个字段并确认保护；勾选核对后"确认并保存"，等"已保存并重新读取"。
4. **选择岗位**：添加完整 JD 或选用真实快照（`data/holdout` 五份 Canonical）；来源与原文可查看。
5. **Matching**：进入匹配分析，记录分数与匹配依据；确认分数语义（关键词覆盖，非录用概率）。
6. **Diagnosis / STAR**：真实配置下生成建议；记录 is_mock=false、耗时、内部尝试；失败时错误界面 + 显式重试，不保留旧结果冒充。同时复核 S1/S2 两个固定案例的新表现，补记到 [star-supplement](star-supplement.md) 或验收台账。
7. **Analytics**：`uv run --locked python -m scripts.import_final_samples --apply` 后导入 Canonical 五份；十条、六雇主、四条 USD/year、五条无区间、一条周期未知；未知值不填零、币种周期不混算。

付费浏览器全链路（可选，需授权与一次性数据库）：`python -m tests.core.product_browser_server --live-diagnosis --market-supplement` + `T5_RUN_LIVE_BROWSER=1 node tests/core/final-live-smoke.cjs`。

## 7. 阶段六：错误状态与 AI 失败 UX

- Resume：超时/429/5xx/401/403/JSON/守卫 → 固定友好信息 + "重新识别/手动填写"；不写简历记录、不覆盖确认字段；守卫拒绝整份返回，不伪装部分成功。
- Diagnosis：TemporaryLLMError → 显式失败 + 重试；受控 502 清旧结果；重试读取真实缓存不伪装 Mock；真实失败不降级演示。
- 上传边界：扫描 PDF（无文字层）明确提示不支持 OCR；不支持格式/加密 PDF/超大文件（`T5_RESUME_UPLOAD_MAX_BYTES` 默认 10 MiB）各自给出明确错误。
- 演示模式：显式演示配置启动后 `is_mock=true` 有明确标识，不得与真实结果混淆。

## 8. 已知限制（验收报告必须原样披露）

1. **Resume AI**：五样本一次性验收 0/5（旧 guard），暴露技能粒度/复合技能误拒/执行计划误判/项目技能漏提四类问题；A1 simplify 修复后**尚未有新的真实质量验收**，需新授权复测，不得引用旧结果。
2. **Diagnosis S1**：旧配置下 93.133s TemporaryLLMError；PR #11 后仍存在真实 read timeout（2026-09-09 线程状态）。**S2** 旧配置失败，#11 后有一次真实成功；仓库内尚无该成功记录的正式证据文件，以本次 E2E 补记为准。单次成功不构成服务稳定性结论。
3. **扫描 PDF 无 OCR**：无文字层即失败，属设计边界不是缺陷。
4. **外部 LLM 可用性不是 100%**：真实调用保有一次以上失败分母；功能可用 ≠ 模型服务稳定达标。
5. 沿用 [delivery-status](delivery-status.md) 运行限制：真实联网仅验证 custom/openai_chat，其余协议离线覆盖；关键词分数非录用概率；本地单用户应用；非全新操作系统安装。

## 9. 完成标准与收尾

- 全部阶段在新 SHA（含 A1）上执行完毕并逐项记录证据（JSON/截图/命令输出），证据放 `docs/final/evidence/` 或验收台账链接。
- 未通过项如实列为限制或 BLOCKED；不合并通过项与历史基线结果。
- 届时才更新 PR #9：新基线 SHA、各阶段结果、fresh install、浏览器验收、剩余限制；PR 保持草稿，不合 main，不宣布最终 PASS。
