# 产品前端迁移记录

日期：2026-09-09。分支：`refactor/frontend-product-shell`，基线 `25707ff`。本次交付迁移前端与必要的静态托管、开发/打包/CI 接入；没有修改业务 API、数据库结构、匹配算法、embedding、AI provider 或 Prompt。提交定位可用 `git log --oneline -- docs/frontend-product-shell.md`。

## 架构与交互

采用 React 19、TypeScript 严格模式、Vite 8、React Router；Context 管理当前简历/岗位选择、流程进度、结果缓存和跨页面草稿。页面拆分到 `frontend/src/pages`，通用 UI 位于 `components`，类型客户端、状态与生命周期位于 `core`。既有 controller 转成 TypeScript 并复用行为测试，React 接管渲染，不再动态挂载原生 DOM 面板。未引入重量级组件库。

首页成为工作台，依据无简历、已确认简历、已选岗位、已匹配、已生成建议五种状态显示下一步。主导航按简历、岗位、匹配、优化组织；市场洞察在辅助入口，快捷原文分析保留。目标岗位采用选择卡片，新增岗位降为次级操作。匹配页展示后端分数、已体现/未体现技能并引导优化，明确未在简历体现不等于没有能力。优化页展示原文/建议/原因、缺失事实标记与复制反馈，必须人工核实后修改，不自动覆盖简历。

保留 PDF/DOCX/TXT 上传与拖放、粘贴、AI 失败原文恢复、手动填写、字段保护、保存后重读、历史选择、合成样例、Mock 来源传播、关键词匹配、Diagnosis 重试、Analytics 全部既有筛选和图表。路由离开清理订阅/请求，更换输入清除旧结果；旧书签可用。草稿不跨浏览器刷新持久保存。

FastAPI 只提供 Vite 的 `dist/assets` 与根 HTML；源码不作为静态资源公开。`start.ps1` 在产物缺失时构建，更新源码可用 `-RebuildFrontend`；Windows 构建先 npm ci/build，再把 dist 打入 PyInstaller，最终用户无需 Node.js。CI 在 pytest 前构建前端。详见 [开发接入](frontend-integration.md)。

## 实测验证

| 检查 | 结果 |
| --- | --- |
| TypeScript 严格检查 + Vite 生产构建 | 通过；主 JS 约 309 kB / gzip 99.65 kB，CSS 约 32.6 kB / gzip 7.12 kB |
| Node 行为测试 | 62 passed，包含既有四模块 controller、API 错误/超时、草稿保护、状态失效与流程进度 |
| Vitest / Testing Library | 13 passed，真实 React 控件与样例交互、页面注册/导航、表单及语义反馈 |
| SQLite 完整 pytest | 618 passed，39 skipped，2 个既有依赖弃用警告 |
| PostgreSQL + pgvector 完整 pytest | 657 passed，0 skipped，2 个既有依赖弃用警告；本地服务测后停止 |
| PostgreSQL smoke、四模块公开契约 | 通过，AI 契约探测保持离线 |
| Ruff check / format | 通过，115 个 Python 文件 |
| Vite 开发代理 | 临时后端 `/api/v1/modules` 响应与 Edge 中 React 首页加载均通过 |
| Windows onedir | 构建成功；隔离 PATH 为 System32，EXE 启动及 health/ready/根页/demo/哈希 JS/CSS 均 200，包内无 src/node_modules |
| Edge 浏览器完整回归 | 1440、1280、390px 四组流程/边界/恢复/产品壳套件全部通过 |

浏览器测试使用独立临时 SQLite、离线 Resume、显式 Mock Diagnosis、真实 Jobs/Analytics。覆盖上传文件与真实拖放、字段保护、保存/重读/历史、五态首页、路由前进后退、匹配与失败重试、优化单次启动与缓存、原文保留、复制剪贴板、XSS、Mock 隐分、长文本、快照去重、分币种/周期薪资、空状态与 390px 无整页横向溢出。桌面匹配和移动端岗位、简历、首页截图另经人工式视觉检查。

可复现命令：

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
node scripts/check_frontend.mjs
npm --prefix frontend run test:e2e
uv run --locked pytest -q
uv run --locked python -m scripts.check_member --ci
powershell -File scripts/build_windows.ps1 -DistPath .verification/react-product-shell/portable-dist -WorkPath .verification/react-product-shell/portable-build
uv run --locked python -m scripts.verify_windows .verification/react-product-shell/portable-dist/T5-Resume-Match
```

测试截图及 JSON 报告保留在本地忽略目录 `.verification/react-product-shell/{flow,boundaries,recovery,shell}`；Windows 产物保留在同目录 `portable-dist`，不提交二进制或测试数据库。历史 Windows 验证见 [便携版记录](windows-portable.md)。

## 验证边界

未调用外部 AI，不把离线/Mock 的流程成功算作真实模型效果验收。Windows 已实测隔离 PATH，未在全新虚拟机上验收。本次本地验证通过不代表远端 CI 已运行通过。应用内浏览器插件缺失服务文件，因此浏览器验证使用独立 Playwright + Edge；初次受限沙箱的 Node spawn EPERM 在允许子进程的环境重跑通过。
