# T5 最终 UI Polish

2026-09-09，A 在准确基线 `ac79807846b2ec928aba0d77e439e8ff676d81b1` 上创建 `feat/ui-polish-a`。本轮仅修改 `frontend/**` 与 `docs/ui/**`，提交后通过 PR 指向 `feat/core-a`，不自动合并。没有修改最终系统验收结论。

## 结果与设计取舍

保留原生 ES modules、FastAPI 同源前端和五页工作台，以真实浏览器的布局为依据。没有新增产品功能、替换技术栈或复制外部品牌。Stitch 历史文档仅作为背景，本轮截图均来自实际运行的系统。

| 页面 | 本轮改善 |
| --- | --- |
| 我的简历 | 原文与结构化简历分栏；版本工具栏降为次级；姓名与教育紧凑排列；技能 chip 保留每行编辑；经历独立卡片；确认区紧随字段。整理、确认保存、选择岗位按当前阶段突出。 |
| 目标岗位 | 当前目标、公司、薪资、技能和工具分层；完整原文可展开；新增表单按需展开；已有匹配提供“查看匹配结果”入口。 |
| 匹配分析 | 分数、目标岗位与公司成为主视觉；已匹配/待补能力以有文字标签的 chip 区分；依据折叠，分数旁始终注明不是录用概率。 |
| 简历优化 | 总体建议、岗位建议、原文/建议对照、修改理由分区；仅高亮原模型文本中的待补充/待核实/待确认标记，复制保留原字符串，不自动采用。 |
| 市场洞察 | 样本、雇主、技能、薪资覆盖四项来自现有响应；条形分布与词云并列；薪资按原分组展示；来源明细放在后方，可展开查看。 |

默认展示前 10 项热门技能，全部频率仍在展开表中；词云仍显示前 30 项。此处只调整展示数量，不改统计、排序或数据。薪资缺失明确显示数据不足，缺失值说明可展开，未作为 0 加入分布，未混合币种或周期。

`styles.css` 统一 token、字体、按钮、输入、chip、badge、反馈和导航样式；`product.css` 管理岗位/匹配/优化布局，Resume/Analytics 的模块样式只保留布局差异，去掉上一轮大量 `body` 层叠覆盖。

- 深青绿 `#176B58`；中性背景 `#F5F7F7`；白色内容面板、轻边框、极轻阴影。
- 主文 15px，移动输入 16px；h1 28px / 移动 25px；辅助信息 12–13px；按钮最小 44px，移动删除按钮同为 44px。
- 面板 10px、控件 7px 圆角；桌面内容含内边距最大 1192px；1440/1280 为双栏，390 为单栏。
- 文本域使用 `field-sizing: content`，紧凑最小高度并允许拉伸、内部滚动；浏览器不支持时保留 `rows` 的可编辑回退，不裁切数据。本轮实际验证为 Edge。
- primary / secondary / ghost / danger 统一；忙碌反馈为真实请求期间的文字与旋转指示，不显示虚构进度百分比。尊重减少动态效果设置。
- 空字段始终显示“未填写”，即便已执行整体确认；整体“已保存”只表示版本已保存，不声称所有字段都有内容。

同一 UI smoke 输入下，1440px 简历页整页截图高度由 1580px 降为 1173px。该数字只是本次合成回归样例的页面尺寸，不是产品效果或用户转化指标。

## 实际浏览器检查

使用现有 `tests.core.product_browser_server --market-supplement`，PostgreSQL 隔离 schema，绑定本机 8770。没有改后端服务器，没有另起前端服务器。Browser 插件初始化因缺少 `browser-service.mjs` 失败，因此改用项目已有 Playwright + Edge 测试环境。

先在准确基线上完成 1440、1280、390px 五页回归并截图，再修改。导航实际只有五项，每页只有一个当前选中项；本轮未重写导航逻辑。完整页截图中的固定底部导航可能出现在视口位置，不代表重复导航或正文中插入导航。最终截图统一回到页首捕获。

真实 HTTP 链路覆盖 Resume、JD、Matching、Analytics。截图中的简历“界面验收”为明确合成测试输入，市场数据使用原有归档样本，未修改验收样本。Diagnosis 的丰富 STAR 展示使用 `is_mock=true` 浏览器 fixture，并注入 503 验证错误；本轮未调用收费 AI，不声称验证了模型质量或 D 的 reliability 改动。

| 检查 | 结果 |
| --- | --- |
| `node scripts/check_frontend.mjs` | 59 passed，包含控制器、公共流程、语法及空字段确认状态回归 |
| `node --check frontend/tests/ui-smoke.cjs` / `polish-smoke.cjs` | 通过 |
| UI smoke，从 1440px 完整执行 | 通过；并检查三种宽度五页 |
| UI smoke，从 390px 完整执行 | 通过；含保存、匹配、诊断失败/重试及市场页 |
| 专项 `polish-smoke.cjs` | 三种宽度均通过：空字段、解析加载态、保护字段重解析、显式采用、另存新版本、刷新后历史重读、长经历、长岗位描述、表内滚动、缺失薪资 |
| 成功后再次生成失败 | 旧建议全部清除；重试后只展示新响应 |
| XSS 与建议文本 | 注入 HTML 作为文本展示；高亮不使用 HTML 插入；原文/建议/复制内容不改写 |
| 本轮路径与业务文件检查 | 全部变更在 `frontend/` 或 `docs/ui/`；backend、data、根测试、脚本、契约、锁文件、所有控制器、API facade、workspace、workflow 与基线无差异 |
| `git diff --check` | 通过 |

已实际查看五页桌面、1280 和移动截图，重点复查简历首屏、匹配焦点、建议对照、加载/错误页。主操作明确，表单空白减少，文字说明降级，移动端可完成主流程；长文本保留可编辑与滚动空间，没有整页横向溢出。

## 尚未解决的范围外事项

当前 `scripts.check_scope --ci` 明确拒绝 `feat/ui-polish-a`，原因是既有分支白名单没有本次用户指定的分支；不是前端路径越界。既有 push 触发分支也未列出本分支。已真实执行并记录失败，未改 CI、`member_specs` 或 scope 脚本，也未用其他分支名伪造通过。PR 检查需要在另行授权的公共 CI 适配中处理。仓库没有独立前端 ESLint，既有前端静态检查口径是 JS syntax gate。

另存新版本后，历史下拉框保留原先选择是基线已有行为；本轮通过 POST 响应新 ID、历史选项、刷新重读验证实际另存，不越界更改版本选择逻辑。

未重跑 clean install、AI 质量评估或修改最终验收报告。本轮 UI 证据不能替代这些已有独立结论。

## 截图与报告

| 页面 | 1440 修改前 → 后 | 1280 修改前 → 后 | 390 修改前 → 后 |
| --- | --- | --- | --- |
| 我的简历 | [前](polish/before/resume-1440.png) / [后](polish/after/resume-1440.png) | [前](polish/before/resume-1280.png) / [后](polish/after/resume-1280.png) | [前](polish/before/resume-390.png) / [后](polish/after/resume-390.png) |
| 目标岗位 | [前](polish/before/jobs-1440.png) / [后](polish/after/jobs-1440.png) | [前](polish/before/jobs-1280.png) / [后](polish/after/jobs-1280.png) | [前](polish/before/jobs-390.png) / [后](polish/after/jobs-390.png) |
| 匹配分析 | [前](polish/before/matching-1440.png) / [后](polish/after/matching-1440.png) | [前](polish/before/matching-1280.png) / [后](polish/after/matching-1280.png) | [前](polish/before/matching-390.png) / [后](polish/after/matching-390.png) |
| 简历优化 | [前](polish/before/diagnosis-1440.png) / [后](polish/after/diagnosis-1440.png) | [前](polish/before/diagnosis-1280.png) / [后](polish/after/diagnosis-1280.png) | [前](polish/before/diagnosis-390.png) / [后](polish/after/diagnosis-390.png) |
| 市场洞察 | [前](polish/before/analytics-1440.png) / [后](polish/after/analytics-1440.png) | [前](polish/before/analytics-1280.png) / [后](polish/after/analytics-1280.png) | [前](polish/before/analytics-390.png) / [后](polish/after/analytics-390.png) |

[空白简历前](polish/before/resume-empty-1440.png) / [后](polish/after/resume-empty-1440.png)；[AI 加载](polish/after/diagnosis-loading.png) / [失败重试](polish/after/diagnosis-error.png)。

[基线报告](polish/before/browser-report.json)、[桌面主流程报告](polish/after/browser-report.json)、[移动主流程报告](polish/mobile-report.json)、[专项边界报告](polish/boundaries-report.json)。移动主流程的原始截图路径指向本机 `.verification/ui-polish-mobile`；上述提交截图均来自桌面主流程最后逐页切换三种宽度的记录。

## 复验

在隔离测试服务中运行，避免向个人数据库写入合成记录。浏览器依赖仍使用已有独立 Playwright 环境，不加入应用依赖。

```powershell
. ./scripts/local_postgres.ps1 -Action Start
./.venv/Scripts/python.exe -m tests.core.product_browser_server --market-supplement
# 另一个终端；NODE_PATH 指向本机既有 Playwright 安装位置
$env:NODE_PATH = Join-Path (Get-Location) '.verification/browser/node_modules'
node scripts/check_frontend.mjs
node frontend/tests/ui-smoke.cjs
$env:T5_SMOKE_WIDTH = '390'
$env:T5_SMOKE_OUT = '.verification/ui-polish-mobile'
node frontend/tests/ui-smoke.cjs
node frontend/tests/polish-smoke.cjs
```
