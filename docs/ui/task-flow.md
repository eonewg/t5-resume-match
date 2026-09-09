# 简历导入与求职主流程

2026-09-09，在 `feat/ui-polish-a@a98f7b5` 上继续开发，更新 [PR #10](https://github.com/eonewg/t5-resume-match/pull/10)，目标仍为 `feat/core-a`，不自动合并。A 基线为 `ac79807846b2ec928aba0d77e439e8ff676d81b1`。

## 这次解决的问题

上一轮统一了样式，却仍要求用户理解保存记录、手动刷新、下拉选择后再加载等内部步骤。简历、岗位和匹配页重复要求相同选择，空页面同时给出多条路径，也没有文件导入入口。本轮以用户完成任务为界面分段依据。

主流程为：**上传或粘贴简历 → 核对并保存 → 选择或添加岗位 → 查看匹配差距 → 优化这份简历 → 市场洞察**。从未选择任何简历/岗位的浏览器页面开始，整个流程没有手动刷新或重复选择。

| 页面 | 删除或合并的操作 | 当前行为 |
| --- | --- | --- |
| 我的简历 | 常驻版本下拉、载入按钮、刷新、新建工具栏 | 首屏上传区；粘贴与历史折叠。提取完成才显示原文和字段。核对保存后只突出“选择目标岗位”。历史列表直接点击，保存后自动更新。 |
| 目标岗位 | 再次选择简历的大下拉、刷新、多个返回入口 | 当前简历摘要；岗位卡片直接选，添加后自动选中。已有选择时首屏突出当前岗位和“开始匹配”，其余岗位收进“更换目标岗位”。 |
| 匹配分析 | 简历/岗位下拉、刷新、再次开始匹配等控制区 | 成功匹配自动进入结果；空页面只有“选择目标岗位”。能力差距、解释和下一步按顺序展示。 |
| 简历优化 | 重复选择、空页面灰色生成按钮 | “优化这份简历”携带当前选择并触发一次生成；已有建议复用。普通导航进入不会自动发起新生成。失败清旧结果，允许重试。 |
| 市场洞察 | 首屏筛选表单、大更新按钮、靠前的样本导入 | 指标、技能、薪资优先；“应用筛选”只在展开后出现，归档样本入口放在底部“演示数据 / 数据管理”。 |
| 公共界面 | 重复页脚、常驻快捷原文入口、占据正文的演示说明 | 顶栏小型演示标记可展开说明，真实/演示结果仍各自标注；快捷原文流程位于次级演示工具。导航逻辑保持原有实现。 |

每个阶段最多一个明显主操作。读取失败才提供针对该操作的重试，不恢复常驻刷新按钮。历史简历显示名称、保存状态和内容摘要；现有 Resume 响应没有时间字段，因此没有编造日期或显示内部编号。

## 上传与事实保护

`POST /api/v1/resumes/upload-preview` 接收 multipart `file`，文本提取后调用现有 preview 和 Resume parser，返回原来的 ResumeData，包括提取的 `raw_text`。上传不写入简历记录，不永久保存原文件；最终仍由用户核对后保存。后端修改只有 Resume 输入适配和对应路由，没有修改原解析业务规则、数据库架构、Matching、Diagnosis、Embedding 或 Analytics 统计。

- TXT 使用 UTF-8，处理开头 BOM，保留其余空白与换行；无法解码明确报错。
- DOCX 提取正文段落和表格内文字，不执行嵌入内容或外链；拒绝宏与 XML 实体，限制 ZIP 展开大小。
- PDF 只提取文本层，不支持 OCR。无有效文字时明确显示：“未能从该 PDF 提取有效文字。扫描版简历暂不支持，请上传可复制文字的 PDF，或直接粘贴简历文本。”
- 上传默认 10 MiB；服务端可配置 `T5_RESUME_UPLOAD_MAX_BYTES`，浏览器入口上限保持 10 MiB。检查后缀、MIME、文件大小、PDF 页数和解压资源；提取文字沿用 50000 字符限制。具体边界见 [API 契约](../api-contract.md)。

依赖新增 `python-multipart`、`pypdf`、`defusedxml`，没有引入 OCR、对象存储或新业务模型。文件名不用于路径构造，错误不展示服务端路径或内部异常栈。

更换文件与重解析一样保护已确认/编辑字段，包括主动清空的字段。新候选内容只能逐项主动采用；新原文会要求重新核对。保存后重新读取并验证一致，更新当前简历。历史版本保持独立，上传失败保留当前输入与已选简历。

## 验证记录

| 验证 | 结果 |
| --- | --- |
| Resume 测试 | 45 passed，包含 26 项上传用例：TXT/BOM、DOCX 段落和表格、文本 PDF、无文本/近空 PDF、格式/MIME、超限、损坏、特殊文件名、压缩资源、原文和旧保存内容保护 |
| Python 全量 | 421 passed，0 skipped，真实 PostgreSQL 隔离 schema；19.03 秒。2 项现有测试依赖弃用提示，不影响通过 |
| 前端全量 | `node scripts/check_frontend.mjs`：68 passed，包含一次性优化意图、结果复用、上传/FormData、保护字段、错误重试及语法 |
| 主流程浏览器 | `node frontend/tests/ui-smoke.cjs`：1440、1280、390 全通过；分别使用 TXT、DOCX、文本 PDF，从空选择完成保存、岗位、匹配、优化与市场页 |
| 边界浏览器 | `node frontend/tests/polish-smoke.cjs`：三种宽度全通过；真实 DataTransfer 拖拽、粘贴回退、上传失败、扫描 PDF、历史直接打开、读取重试、保护字段、长文本和缺失薪资 |
| 依赖 | `uv sync --locked` 通过；只新增上传需要的三项依赖，无无关升级 |
| Ruff / format / diff | `ruff check .`、`ruff format --check .`、`git diff --check` 通过 |
| 授权路径 | 对照本次请求检查：仅 frontend、Resume 输入适配/测试、pyproject/lock、UI 文档和必要 API 文档；Diagnosis 后端等禁止路径无差异 |
| 现有 CI scope | `check_scope --ci` 仍拒绝 `feat/ui-polish-a`，原因是现有分支白名单；遵照本次要求未修改 CI/白名单，不能记为全绿 |

Browser 插件初始化缺少 `browser-service.mjs`，实际使用项目已有 Playwright + Edge。页面由 FastAPI 同源提供，后端为现有 `tests.core.product_browser_server --market-supplement`，本机 8770、临时 PostgreSQL schema。没有改测试服务器或使用正式数据写入。Python 沙箱首次执行被临时目录 ACL 拒绝，改在正常本地权限下运行后全量通过；没有修改测试以绕过错误。

匹配使用真实关键词服务；确认技能只保留 SQL 后，原文中的 Python 不会被重新带入，结果为 33.33%。Diagnosis 的 STAR 内容使用明确 `is_mock=true` 的浏览器 fixture；503 用来验证失败清空与重试，不代表完成真实模型质量验证，也不涉及 D 正在进行的可靠性改动。全部简历和新增岗位为合成测试内容，市场页使用已有归档样本及其原始来源口径。没有声称做过真人新手用户测试。

已查看桌面和移动截图，移动岗位页“开始匹配”在首屏；空 Matching/Diagnosis 无重复选择控件，历史入口默认收起。无整页横向溢出，来源表仅在自身容器滚动。整页截图的固定底部导航显示在视口位置，不表示正文中存在重复导航。

## 前后对比与截图

Before 直接引用 `a98f7b5` 中上一轮的真实截图；After 为本轮浏览器生成。两轮使用合成输入，展示流程差异，不将页面尺寸当作用户效果指标。

| 页面 | Before 1440 / 390 | After 1440 / 1280 / 390 |
| --- | --- | --- |
| 简历 | [桌面](polish/after/resume-1440.png) / [移动](polish/after/resume-390.png) | [桌面](task-flow/after/resume-1440.png) / [1280](task-flow/after/resume-1280.png) / [移动](task-flow/after/resume-390.png) |
| 岗位 | [桌面](polish/after/jobs-1440.png) / [移动](polish/after/jobs-390.png) | [桌面](task-flow/after/jobs-1440.png) / [1280](task-flow/after/jobs-1280.png) / [移动](task-flow/after/jobs-390.png) |
| 匹配 | [桌面](polish/after/matching-1440.png) / [移动](polish/after/matching-390.png) | [桌面](task-flow/after/matching-1440.png) / [1280](task-flow/after/matching-1280.png) / [移动](task-flow/after/matching-390.png) |
| 优化 | [桌面](polish/after/diagnosis-1440.png) / [移动](polish/after/diagnosis-390.png) | [桌面](task-flow/after/diagnosis-1440.png) / [1280](task-flow/after/diagnosis-1280.png) / [移动](task-flow/after/diagnosis-390.png) |
| 市场 | [桌面](polish/after/analytics-1440.png) / [移动](polish/after/analytics-390.png) | [桌面](task-flow/after/analytics-1440.png) / [1280](task-flow/after/analytics-1280.png) / [移动](task-flow/after/analytics-390.png) |

| 状态 | 1440 | 1280 | 390 |
| --- | --- | --- | --- |
| 上传入口 | [截图](task-flow/after/resume-empty-1440.png) | [截图](task-flow/after/resume-empty-1280.png) | [截图](task-flow/after/resume-empty-390.png) |
| 上传中 | [截图](task-flow/after/upload-loading-1440.png) | [截图](task-flow/after/upload-loading-1280.png) | [截图](task-flow/after/upload-loading-390.png) |
| 无匹配 | [截图](task-flow/after/matching-empty-1440.png) | [截图](task-flow/after/matching-empty-1280.png) | [截图](task-flow/after/matching-empty-390.png) |
| 无优化上下文 | [截图](task-flow/after/diagnosis-empty-1440.png) | [截图](task-flow/after/diagnosis-empty-1280.png) | [截图](task-flow/after/diagnosis-empty-390.png) |
| 优化失败 | [截图](task-flow/after/diagnosis-error-1440.png) | [截图](task-flow/after/diagnosis-error-1280.png) | [截图](task-flow/after/diagnosis-error-390.png) |
| 扫描 PDF 提示 | [截图](task-flow/boundaries/pdf-no-text-1440.png) | [截图](task-flow/boundaries/pdf-no-text-1280.png) | [截图](task-flow/boundaries/pdf-no-text-390.png) |

[主流程报告](task-flow/after/browser-report.json) · [边界报告](task-flow/boundaries/report.json)。测试输入位于 `frontend/tests/fixtures/`，全部是明确合成内容；无文本 PDF 是无文字页面 fixture。

最终提交 SHA 和 CI 状态以 PR #10 最新说明为准。分支仍未合并；D 的 `feat/diagnosis-reliability-d` 未集成，本轮不改变最终系统验收结论。合并前应重新核对最新 A 基线。
