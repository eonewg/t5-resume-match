# UI 产品化交付验证

基线：`41ab5ce`；专项分支：`feat/ui-refresh-d`。设计先于前端修改完成，Stitch project `4839069813519735528`。统一规范见 [DESIGN.md](DESIGN.md)，首版/变体及 critique 见 [stitch-review.md](stitch-review.md)。

## 完成内容

- 默认首页“我的简历”，五项用户导航与 390px 底部导航；快捷原文流程保留在次级入口，桌面/移动均可访问。
- 简历保留原文、候选建议、编辑保护、确认保存、版本分页、保存后重读、草稿与迟到响应保护。文案改为已修改/已确认/发现新的建议。
- 目标岗位展示真实保存记录、技能/工具、薪资与来源；新增表单按需展开。匹配结果拆为独立导航，复用同一公共 API 和 workspace，切换选择/重算失败清除旧结果。
- 匹配结果优先展示实际分数、已匹配能力、待补能力；完整 gap_analysis 原样放入“查看匹配依据”。不新增权重、百分位、推测建议或技能事实。
- 优化页保留全部建议，既有 STAR 格式拆为原文/建议对照；未知格式原样显示。复制建议后人工核实编辑，不伪造自动采用接口；结果保留当前会话，失败清旧结果。
- 市场图表以实际技能条形图为主，词云仍可展开；保留来源/日期筛选、归档导入、样本数量、分币种周期薪资及来源明细。缺失薪资不作为零参与图表。

普通文案使用目标岗位/岗位要求、综合匹配度、已匹配能力、待补能力、暂未提供、演示数据。API 字段名与 Mock provenance 不更改；技术计算解释只在主动展开的依据中。模型返回和输入中的真实技术技能名称不做盲目删除。

## 实际验证

| 验证 | 结果 |
| --- | --- |
| `node scripts/check_frontend.mjs` | 57 passed，包含所有模块 controller、公共流程、语法检查及新增跨页结果/文本对照测试 |
| `uv run --locked pytest -q` | 396 passed，真实 PostgreSQL 17.6 / pgvector 0.8.1 环境，无 skip |
| Ruff check / format check | 全部通过，91 Python 文件格式通过；仓库没有独立 ESLint 配置，前端 lint 口径为既有 JS syntax gate |
| `python -m scripts.check_member --ci` | UI 分支四模块公共接口检查通过；Diagnosis 显式离线，不调用收费 API |
| `node frontend/tests/ui-smoke.cjs` | 完整主流程、1440px/390px 五页、错误/空态/加载/重试、XSS 与术语检查通过 |

浏览器使用既有 `tests.core.product_browser_server --market-supplement`，隔离 PostgreSQL schema；没有修改后端测试服务器。
真实 Resume/JD/Matching/Analytics 经公共 HTTP API 执行。合成简历原文包含 Python/SQL，用户确认只保留 SQL；重解析后仍为 SQL，保存重读一致，匹配 SQL/Python/Docker 岗位返回 33.33%。
Diagnosis 使用明确 `is_mock=true` 的确定性浏览器 fixture 验证丰富 STAR 展示，并注入 503 验证失败重试；未调用收费模型、未重做 A 的 AI 盲评，不以此声称真实模型验收。
市场快照导入后可见 10 条真实岗位、6 家雇主；5 条无完整薪资、1 条单位不明确，不进入可比较薪资图。数据来自 A 既有验收库，非 UI 写死。

浏览器报告与桌面/移动截图位于本机 `.verification/ui-refresh/`（不提交数据库、密钥或测试产物）；可用以下步骤复验：

1. 按 A 的方式连接隔离测试 PostgreSQL，启动 `python -m tests.core.product_browser_server --market-supplement`，默认端口 8770。
2. 本机安装 Playwright/Edge 时运行 `node frontend/tests/ui-smoke.cjs`。脚本只使用隔离测试服务，失败时报错，不吞掉断言。
3. 报告写入 `.verification/ui-refresh/browser-report.json`；截图包含五页 `*-1440.png` / `*-390.png`。

## A 后续事项与限制

- 不改 backend、数据库、公共 API、算法、CI 或根依赖；没有新公共接口请求。
- A 的旧 `tests/core/final-live-smoke.cjs` 依赖旧按钮文字（如“解析并保存 JD”“计算匹配”），UI 更新后需要 A 更新选择器；本次提供新的完整 UI smoke，未越权修改 tests/core。AI 盲评与 fresh install 仍由 A 管理。
- 原生 ES modules/CSS 实现，不引入 React 或复制 Stitch HTML。部分 Stitch 示例自行加入不存在功能，已在评审和实现中剔除。
- 样本不是全就业市场；数字和原文保护不是完整语义真实性证明。保留既有依赖的两个弃用警告，没有为 UI 改根依赖。
