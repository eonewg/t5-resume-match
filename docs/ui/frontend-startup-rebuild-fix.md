# Windows 前端重建时的 EPERM 修复

2026-09-10，分支 `refactor/frontend-product-shell`，前端基线 `af392af5e5540d9190eeabe39556bca53b123caf`。

用户运行 `powershell -ExecutionPolicy Bypass -File .\start.ps1 -RebuildFrontend`，在 `npm ci` 删除 `rolldown-binding.win32-x64-msvc.node` 时遇到 `EPERM / unlink`。启动脚本未进入构建或服务启动阶段。

## 已确认原因与恢复

- 当时的本项目 Vite 进程 PID `52256`，命令参数 `--port 5199 --strictPort`，实际加载了报错路径中的 Rolldown 原生模块。
- 对该文件尝试独占打开，Windows 返回“文件正由另一进程使用”，复现文件占用。
- 失败的 `npm ci` 已部分删除依赖；`npm ls --depth=0` 报多项 missing/invalid。
- 核对命令行后停止该 Vite 进程，按现有锁文件重新 `npm ci`，成功安装 111 个包。未停止其他 Node 进程、修改权限或修改锁文件。

## 脚本调整

- 在 `node_modules` 内记录 `package.json` 和 `package-lock.json` 的 SHA256 指纹；不提交本地标记文件。
- 指纹一致且 `npm ls --all --silent` 通过时，`-RebuildFrontend` 直接构建，避免每次删除和重装依赖。
- 需要安装时，先独占打开现有 `.node` 文件，发现占用或不可写立即给出关闭本项目 Vite/测试进程的提示，尚未执行 `npm ci`。
- 首次安装、依赖清单变化或依赖检查失败仍使用 `npm ci`，成功后才写入指纹。

## 验证

- 新增 Windows PowerShell 5.1 脚本回归：3 项通过。临时目录模拟外部命令，真实持有文件句柄；验证正常重建不重装、占用时安装前退出且文件保留、损坏依赖重新安装。
- 测试首次运行遇到从 Python 继承 PowerShell 7 模块路径的问题。测试子进程清除继承的 `PSModulePath`，由 Windows PowerShell 初始化自身模块路径；生产脚本不改宿主环境。
- 实际运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 -RebuildFrontend`，复用依赖，typecheck 和 Vite build 通过，Uvicorn 在 `127.0.0.1:8000` 启动完成。
- 实际 HTTP 首页和 `/health` 均返回 200，首页包含 React root。
- Ruff、格式检查、`git diff --check` 通过。未调用真实 AI，未更改业务代码。
