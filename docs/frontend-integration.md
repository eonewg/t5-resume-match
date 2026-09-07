# 公共前端接入

## 运行与技术栈

运行 `start.ps1`，打开 `http://127.0.0.1:8000/`。公共壳由 FastAPI 同源提供，使用 HTML、CSS 和原生 JavaScript ES modules；无需 npm 安装或构建。Node 22+ 只用于 `node scripts/check_frontend.mjs` 开发检查。

首页已接通合成样例填充、简历/JD 保存、匹配与诊断、错误反馈、Mock 标签和当前选择状态。diagnosis 已正式挂载；resume、jobs、analytics 仍为占位入口，不能视为已完成业务页面。`/docs` 与 `/openapi.json` 继续保留。

## 自己的目录与入口

| 角色 | 目录 | 预览 URL |
| --- | --- | --- |
| A | `frontend/src/modules/resume/` | `/?preview=resume#resume` |
| D | `frontend/src/modules/jobs/` | `/?preview=jobs#jobs` |
| D | `frontend/src/modules/diagnosis/` | `/?preview=diagnosis#diagnosis` |
| A | `frontend/src/modules/analytics/` | `/?preview=analytics#analytics` |

在自己的目录创建 `index.js`，可复制 [最小面板示例](../examples/frontend-panel.js) 的结构。公开导出：

```javascript
export function mount(container, { api, getState, updateSelection, subscribe, signal }) {
  const title = document.createElement("h1");
  title.textContent = "我的模块";
  container.replaceChildren(title);
  // 使用 api.request('/api/v1/...') 调用公开接口。
  // 使用 getState() 读取工作台当前选择。
  // 按需返回清理函数；切换页面时释放订阅、事件与定时器。
  return () => {};
}
```

无需改公共注册表即可用上表 URL 在本地预览，限定四个固定模块路径。尚未验收的模块在普通导航仍显示占位页面；验收后由 A 在 `frontend/src/core/modules.js` 设置对应 `load: () => import('../modules/<模块>/index.js')` 正式挂载。

预览只验证 UI 接入，不意味着后端已切换为真实 provider。需要联调时用本地 `.env` 配置自己的后端公开类，其余模块可保留 Mock。

## 共用能力

- `api.request(path, {method, body})`：同源 JSON 调用，默认 45 秒超时，失败抛出带 message/status 的 ApiError，成功返回 `{data, isMock}`。公共便捷方法见 `frontend/src/core/api.js`。
- `getState()`：返回当前 `resumeId`、`jdId`、`result`、`isMock` 的副本。状态只在当前页面内存中保留；刷新后需重新选择已存记录。
- `updateSelection({...})`：只更新上述四个字段。修改输入时公共工作台会清除旧选择，避免显示过期结果。
- `subscribe(listener)`：返回取消订阅函数。`mount` 可返回清理函数；`signal` 会在页面切走时中止，异步返回后也要检查取消状态。
- `.card`、`.button.primary`、`.button.secondary` 和 CSS 变量可复用；自己的样式限于 `[data-module="resume"]` 等模块根节点，不覆盖其他模块全局样式。

纯浏览器 ES modules 不支持直接 `import './styles.css'`。若使用独立 CSS，由模块创建 `<link rel="stylesheet">` 指向 `new URL('./styles.css', import.meta.url)`，卸载时移除。

所有来自用户或 API 的文本使用 `textContent`、表单 value 等安全方式显示，不拼进 innerHTML。Mock 结果必须展示标签；公共壳对 Mock 匹配显示“—”而不把固定 0/50 分当成真实评分。

## 验证与边界

至少检查：正常返回、输入缺失、服务失败后可重试、长文本、390px 窄屏无整页横向溢出、切换页面不会残留事件订阅。组件可在成员自己的测试目录或前端模块目录放 `*.test.mjs`，使用 Node 内置测试；公共命令和 CI 自动发现 frontend/tests、frontend/src/modules 和 tests 下的全部此类文件。DOM/交互验证提供真实截图和复现步骤，由 A 结合接口验收。

后台已有记录不会因前端失败被自动删除：简历和 JD 是独立创建请求，workflow 的匹配/诊断才在一个事务中。重试可能创建新的简历/JD，当前没有幂等上传和历史选择界面。A 须完成简历结构化编辑与保存读取、公共选择联动；D 完成 jobs/diagnosis 界面。

公共导航、首页编排、API 客户端、共享状态、全局样式和静态路由属于 A；成员不要另起前端服务器或自行改这些文件。需要共享组件或依赖时先提交集成请求。
