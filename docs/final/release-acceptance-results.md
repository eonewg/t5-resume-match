# 最终集成验收执行记录（2026-09-09）

基线 **559118d**（`feat/core-a`，含 PR #10/#11/#12 与 A1 Resume simplify PR #13），从 GitHub 全新 clone（`.verification/fresh-install-20260909`），空 uv 缓存冷安装，独立空库 `t5_fresh_20260909`（本机 PostgreSQL 17.6 / pgvector 0.8.1 原生实例）。执行计划见 [release-acceptance](release-acceptance.md)。

**本记录是执行结果，不是最终交付 PASS。** PR #9 保持草稿，不合 main。

## 一、已执行并通过

| 项 | 结果 |
| --- | --- |
| 冷缓存 `uv sync --locked` | 35 包安装，锁文件未变 |
| `scripts.migrate` ×2 | 幂等 PASS；vector 扩展 0.8.1；public 8 表 |
| 全量 `pytest -q`（T5_TEST_DATABASE_URL 指向 PG） | **571 passed / 0 skipped**，仅两条既有依赖弃用警告 |
| `ruff check` + `format --check` | 通过（105 文件） |
| `node scripts/check_frontend.mjs` | **76 / 76** |
| `scripts.smoke_postgres` | PASS（扩展/迁移/索引/向量读写/Resume→JD→关键词匹配） |
| `check_member --ci` | 四模块公开契约 PASS（resume/diagnosis 离线口径符合约定） |
| GitHub Actions @ 559118d | push 与 PR 两 run 全 job success |
| 普通应用启动（127.0.0.1:8772） | `/health` ok；四模块 `is_mock=false`（真实 AI 配置经进程环境注入，未复制 .env） |
| 无 AI API 检查 | 直存简历创建/回读字节一致；JD 201；匹配 201（33.33%、gap_analysis 在、`is_mock=false`）；analytics 200 |
| 浏览器主流程 1440/1280/390（`task-flow-smoke.cjs`） | PASS：TXT/DOCX/PDF 三种真实上传识别、加载态、保存/历史自动更新、岗位自动选中、匹配 33.33%、Diagnosis fixture 自动开始/缓存/错误/重试、XSS 纯文本与来源标注、analytics 首屏与表内滚动；30 张截图 |
| AI 失败恢复（`resume-ai-recovery-smoke.cjs`，离线） | PASS：504/503 → 显示已提取原文 + "重新识别/手动填写"，重试提交现有原文不重传，手动保存成功；1440/390 两宽度，raw 2906 字符保真，零模型调用 |
| 边界回归（`polish-smoke.cjs`，离线 fixture 服务器 + `--market-supplement`） | PASS：扫描 PDF 精确文案、空/类型/损坏/超大/离线拒绝、真实拖放、保护字段/重解析、原文归档不被覆盖、显式采纳、历史直取、粘贴兜底、超长文本、缺薪资态、筛选错误重试；三宽度 |
| 文件→raw_text 离线提取（直连 `upload.py`，零 AI） | PASS：txt/docx/pdf 三格式提取成功；`no-text.pdf` 返回精确"扫描版不支持"文案；空/坏文件按类型拒绝 |

## 二、真实 AI 调用台账（本会话，如实记录，不重跑覆盖）

**Resume AI：5 次**，全部服务端完成并返回 200：

| # | 触发 | 输入 | 备注 |
| --- | --- | --- | --- |
| 1 | `scripts/smoke.py` `/resumes/parse` | examples 团队样例 | 客户端 15s 固定超时放弃，服务端完成并落库（行随 DB 重置清除）；parse 端点会建行的行为在此留档 |
| 2 | task-flow 首轮 @1440 TXT | `fixtures/resume.txt` | 该轮在 analytics 步骤因 QA 数据前置中断（见三-3），非产品缺陷 |
| 3 | task-flow 通过轮 @1440 TXT | 同上 | **指定为"Resume AI 1 次正式产品验收"**：上传 → AI 结构化 → 字段核对 → 手动编辑（技能/经历）→ 保存 → API 回读一致 |
| 4 | task-flow 通过轮 @1280 DOCX | `fixtures/resume.docx` | 同链路通过 |
| 5 | task-flow 通过轮 @390 PDF | `fixtures/resume.pdf` | 同链路通过 |

**Diagnosis：0 次新增。** S1/S2 引用 D 已合入证据 [reliability-fix-2026-09-09.json](../../tests/diagnosis/evidence/reliability-fix-2026-09-09.json)（新可靠性默认值，`worst_case_seconds=95.0`）：

- **S1：真实 read 超时**——TemporaryLLMError / category=timeout / phase=read，总耗时 81.953 秒，2 次内部尝试（40.5s + 超时）。
- **S2：真实成功**——29.657 秒、单次传输尝试、HTTP 200，`is_mock=false`，2 条 STAR 改写（含理由）、8 条 JD 定向建议与风险标注；改写内容保留原文明示事实（93.1% 瓶颈、1820.78ms→489.18ms、3.7x）并明确标注待补信息。

## 三、QA 工具限制（记录为环境/脚本问题，非产品缺陷，不再扩展修复）

1. `scripts/smoke.py` 客户端固定 15s 超时，只适合离线/Mock 服务器；真实 AI 链路由浏览器 E2E 与专项检查覆盖。
2. `tests/resume/fixtures/stefano-user.txt` 在 Windows 检出为 CRLF（`frontend/tests/fixtures/.gitattributes` 未覆盖 `tests/resume/fixtures/`），recovery 冒烟的 UI 比对需 LF；本轮在 fresh clone 内本地规范化后通过，仓库侧可在后续补 eol 属性。
3. `task-flow-smoke` 的 analytics 来源表要求库中已存在真实来源 JD——需先执行 `scripts.import_final_samples --apply` 再跑，否则超时。
4. `polish-smoke` 的 QA 服务器需带 `--market-supplement` 启动，否则 disposable schema 中 `sample_size=0` 走整体空态，`.analytics-empty-salary` 断言不成立。
5. task-flow 首轮失败的 report 被通过轮覆盖（同输出目录）；失败原因即上述 3，在本节留档。

## 四、本轮未执行（脚本就绪；按"不再优化 harness、不新增真实 AI 调用"口径留待下轮）

- 持久化：API 快照 → 重启 → `fresh-persistence-smoke.cjs` 逐路径比对（上一基线 a41a31d 曾 PASS；本轮未重跑）。
- Canonical 五份导入后 analytics 十条/六雇主/四 USD 年薪口径复验。
- S1/S2 新一轮真实调用（无新授权不执行；现行证据为上表）。
- `final-live-smoke.cjs` 付费浏览器全链路（可选项）。

## 五、结论

本轮已执行范围（冷安装、静态验证、PG/pgvector、四模块契约、三宽度浏览器主流程含真实 Resume 链路、AI 失败恢复、边界回归、离线提取、真实调用台账）**全部通过，未发现产品缺陷**；过程中三项失败均为 QA 工具/数据前置问题并已定位留档。已知限制（旧 guard 五样本不可沿用、S1 超时、扫描 PDF 无 OCR、外部 LLM 可用性、单机单用户等）按 [release-acceptance](release-acceptance.md) 第 8 节与 [delivery-status](delivery-status.md) 披露。

最终交付判定待第四节各项补齐后另行作出；PR #9 保持草稿。
