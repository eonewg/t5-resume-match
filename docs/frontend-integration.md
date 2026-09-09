# 前端开发与接入

前端使用 React 19、TypeScript 严格模式、Vite 8 和 React Router。生产环境由 FastAPI 同源提供 `frontend/dist`；开发环境用 Vite 代理现有 API。后端业务接口、数据库、匹配算法与 AI Prompt 不因本次迁移改变。

## 运行

开发机需要 Node.js 22+、npm 和项目 Python 环境。首次运行 `start.ps1` 时自动安装并构建缺失的前端产物；源码更新后运行 `start.ps1 -RebuildFrontend`。Windows 便携版用户无需 Node.js。

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
# 终端一：仓库根目录
uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
# 终端二：前端热更新
npm --prefix frontend run dev
```

Vite 默认将 `/api`、`/health`、`/ready`、`/demo` 代理到 `http://127.0.0.1:8000`；可在前端开发环境中用 `T5_API_PROXY_TARGET` 更换目标。生产构建只包含静态文件，后端只挂载 `dist/assets`；未构建时根页面返回 503 和构建提示。

## 页面与状态

| 路由 | 页面职责 |
| --- | --- |
| `/#/` | 首页工作台，根据当前状态展示下一步、四步进度、简历与岗位上下文 |
| `/#/resume` | 导入、识别、受保护字段核对、保存后重读、历史选择 |
| `/#/jobs` | 卡片选择目标岗位；次级入口添加岗位、填入合成样例 |
| `/#/matching` | 后端匹配分数、已体现技能、未体现技能与下一步优化 |
| `/#/diagnosis` | 总体建议、原文/建议表达/原因对照、复制与人工核实 |
| `/#/analytics` | 辅助市场洞察，保留筛选、快照导入、技能与分组薪资统计 |
| `/#/workspace` | 保留快捷原文分析流程 |

旧 `#resume` 等入口在首次加载时归一到新路由。导航由 React Router 管理，浏览器前进/后退可用。市场洞察位于辅助导航，不打断简历到优化的主流程。

`WorkspaceProvider` 管理当前选择、结果和页面间草稿；路由离开时保留简历草稿，清理订阅并取消请求。草稿与当前选择仅在内存中保存，刷新后通过服务端历史重新选择，不向浏览器持久存储写入简历原文。更换简历或岗位后清除过期匹配/诊断；请求取消与序号检查阻止旧结果覆盖新状态。

## 代码边界

- `src/App.tsx`：路由、导航、服务状态、页面错误边界。
- `src/pages/`：React 页面；`src/components/ui.tsx`：公共控件、反馈与空状态。
- `src/core/contracts.ts`、`api.ts`：API 类型与统一客户端，保留 JSON、multipart、Mock 标识及结构化错误。普通请求 45 秒，诊断/工作流 120 秒，简历识别 150 秒；由用户主动重试。
- `src/core/state.ts`、`WorkspaceContext.tsx`：共享选择、进度、缓存及 React 生命周期。
- `src/modules/*/controller.ts`：迁移为 TypeScript 的既有业务状态转换，继续复用行为测试；不操作 DOM。
- `src/demo/fixtures/*.ts`：合成文本，填入不触发解析、保存或付费调用。
- `src/styles.css` 与 `src/shell.css`：基础模块样式及新产品布局，无重量级组件库。

新增 UI 使用 React 组件和既有类型客户端，不再使用 `mount(container, context)` 或模块动态注册表。`examples/frontend-panel.js` 仅为历史开发期示例，不是当前接入入口。

## 检查

```powershell
npm --prefix frontend run build
node scripts/check_frontend.mjs
npm --prefix frontend run test:e2e
```

公共检查执行 TypeScript、Node 行为测试和 Vitest/Testing Library 页面测试。浏览器验收脚本启动临时 SQLite 服务，使用离线 Resume、显式 Mock Diagnosis 和真实 Jobs/Analytics，默认通过本机 Edge 执行；不调用付费 AI，也不打开用户数据库。覆盖 1440/1280/390px 的流程、边界与失败恢复，报告写入忽略目录 `.verification/react-product-shell`。真实 AI 效果需单独验证。迁移证据见 [产品前端迁移记录](frontend-product-shell.md)。
