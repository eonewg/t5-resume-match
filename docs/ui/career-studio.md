# T5 职业编辑室：桌面视觉与交互重设计

2026-09-10 · `refactor/frontend-product-shell` · React / TypeScript / Vite

## 设计方向

以「职业编辑室」组织 Career Workspace：暖纸色背景、墨绿文字与导航、少量朱砂色强调；宋体与 Georgia 承担标题和数字，无衬线字体承担操作与正文。字体均采用本地系统回退，不依赖联网字体，也不增加 EXE 运行依赖。

七个页面共享色彩和导航，但按工作内容采用不同组织方式：

- Home：封面式主视觉、下一步行动、轻量目录与当前资料。
- Resume：左侧原文工作区与右侧纸页编辑器，长文编辑时原文保持可用。
- Resume history：独立简历档案页，分页浏览、当前版本标记和版本操作。
- Jobs：姓名、教育和技能组成简历身份摘要；岗位集合提供即时本地搜索，添加入口前置。
- Matching：拱形分数区、目标说明、能力与缺口对照，以及完整评分依据。
- Diagnosis：编辑批注式总结、三个优先项、原文和建议对照，剩余建议保留在展开项中。
- Analytics：研究页式数字、技能图表和词云；数据来源、缺失值及原始薪资单位仍可核对。

视觉验收基于实际 Edge 页面截图，不以测试结果代替视觉判断。第一轮检查后前置了岗位添加入口、增加搜索并修正档案页操作布局。

## 产品行为

新增兼容的 `DELETE /api/v1/resumes/{id}` 与 `DELETE /api/v1/resumes`，返回 `{deleted_count}`。同一事务删除关联匹配、诊断；PostgreSQL 外键清理简历文档向量和片段向量，岗位和岗位向量保留。删除失败整体回滚。清空针对全部记录，独立于当前列表分页。

档案页删除成功后移除过期选择、匹配和诊断结果，清理草稿的已保存引用；用户编辑内容继续作为未保存草稿保留。打开其他版本前确认是否替换未保存修改。

简历解析建议按规范化后的内容去重，过滤已有、空白和重复项。技能/经历仅显示新增项，明确采用时追加并保留已有内容。已采用项随当前草稿跨页面保留，手动编辑或重新识别后不再重复出现；打开其他简历时使用其自己的建议状态。不做语义推断或改动 AI Prompt。

## 验证结果

- PostgreSQL 接入后的完整 pytest：662 passed，2 条第三方弃用提示；其中覆盖真实向量级联删除。
- 前端控制器与基础测试：63 passed；React：22 passed。
- Vite / TypeScript 构建通过；Ruff check、format、公开模块契约和 maintenance scope 检查通过。
- Edge 浏览器：1920×1080、1440×900、1366×768、1280×800。既有 flow、boundaries、recovery、shell、desktop 五套通过；新增 studio 套件四种宽度通过。
- 浏览器覆盖上传、拖放、原文保留、保护字段、保存重读、匹配、诊断恢复、样本口径、长内容、历史分页/删除/取消/清空、状态失效、岗位搜索与建议去重。新增套件第一次发现 hash 导航保留草稿，修正测试使用完整刷新后通过；产品的草稿保留行为正常。
- 原有 Windows 构建脚本成功生成 EXE；原有 verify_windows 验证通过，包括配置路径、冻结诊断 worker、四模块以及 HTML/JS/CSS 静态资源。

浏览器在隔离数据库上运行，使用离线 Resume 和明确 Mock Diagnosis，建议去重使用显式响应样例；这些结果验证交互与集成，不代表本次重新评估了外部 AI 模型质量。AI Prompt、匹配算法和 Windows 打包代码未修改。

复现：`npm --prefix frontend run test:e2e`（默认为本次桌面范围）。只运行新增套件：`node frontend/tests/product-shell-smoke.cjs --desktop studio`。

本地完整截图和 JSON 报告在 `.verification/desktop-workspace/`；EXE 验证构建在 `.verification/studio-package/dist/T5-Resume-Match/`。截图包括 Home、Resume、Jobs、Matching、Diagnosis、Analytics、简历档案多页和空状态。`.verification` 保持忽略，不混入发布源码。
