# PR #8 UI 集成验收

2026-09-08，A 基线 `41ab5ce8d4a23544a79e601bcacd6aa10d1369b9`，D head `828dc948767e64d28c2b6dc9450bd11162331910`，PR `feat/ui-refresh-d → feat/core-a`。结论：**PASS（UI 集成范围）**，没有发现阻塞合入 A 的问题；不是全系统最终质量 PASS。

## 审查结果

- 17 个文件限于 frontend 与 docs/ui，未修改后端、数据库、算法或 API。五页映射已有简历、岗位、匹配、诊断和市场能力，没有头像、通知、投递、虚构百分位或自动采用建议接口。
- Resume controller 未改变，编辑/清空保护、重新解析候选、显式确认、保存后 GET 全字段比较与历史版本保持。原文和编辑值以原值读写。
- Matching 使用后端分数，演示结果不显示数值；选择变化和重算失败清除旧结果，跨页保留同一配对结果。无能力可评估时显示暂无法评估。
- Diagnosis 保留真实/演示来源、失败与重试、原文—建议对照、未知格式文本及核实提醒。复制仅复制文字，不自动写回简历；显示真实生成内容不等于认可其中所有事实。
- Analytics 来源、日期、样本量、雇主、薪资币种/周期和缺失数量保持；词云可展开，未知薪资不作零计入。十条真实来源样本：六家雇主，四条 USD/year，五条无区间，一条周期未知。
- 固定界面中的工程术语已改为用户文案，详细匹配依据收于展开区。模型原始输出仍可能包含 JD 等词，不为界面文案清理而改写生成建议或招聘方原文。
- 1440px 与 390px 五页回归通过；查看桌面诊断与移动简历/市场截图，布局可用、无页面横向溢出，来源宽表在表内滚动。

## 验证

准确 head 隔离 worktree：Python **396 passed / 0 skipped / 23.04 秒**；frontend **57 passed**；PostgreSQL 17.6 / pgvector 0.8.1 smoke、D UI scope（17 文件）通过。GitHub push/PR 共十项 SUCCESS。Ruff 代码检查通过；扩大到文档的格式检查发现 A 既有 postgres.md 代码块格式差异，A 仅作格式整理并复验通过。

运行 `frontend/tests/ui-smoke.cjs`：五页、确认后重解析、保存重读、真实 33.33%、503 失败/重试、明确演示 fixture、XSS 纯文本、来源缺失、空态、快捷流程和桌面/390px 均通过。fixture 不作为真实 AI 证据。

A 的 `tests/core/final-live-smoke.cjs` 仅更新折叠入口、按钮定位和状态文案，未移除业务断言。新 UI 的真实 custom/openai_chat 调用 **53.155 秒 / is_mock=false**，返回 STAR 和岗位建议；原文 Python 未重新写入确认 SQL 经历，受控 502 清除输出、重试读取真实缓存。浏览器全链路、市场统计、移动与保存重读通过。证据见同目录 evidence/pr8-live-browser.json 与 evidence/pr8-ui-browser.json。

## 集成与后续

本记录对应准确 D head；A 适配提交后合入 PR #8，合并 SHA 和 fresh install 结果见 [最终安装记录](fresh-install.md)。main 不自动合并。固定评估的两空 STAR/一失败与两款竞品未体验仍如实保留，不由本次 UI 验收覆盖。
