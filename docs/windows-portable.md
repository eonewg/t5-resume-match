# Windows 便携版验证

2026-09-09，从最新 `origin/main` 的 `83608917b60194e7f0d20bb414ede7b91fd23058`
创建 `feat/windows-portable`；本次为打包与启动适配，不修改业务算法或 UI，`start.ps1` 未改动。

## 构建与路径

- Windows 11 x64、Python 3.13.5、PyInstaller 6.22.2；`scripts/build_windows.ps1` 使用锁定 build 依赖组与 onedir。
- 产物 `dist/T5-Resume-Match/T5-Resume-Match.exe`，12,518,376 字节（11.94 MiB）。
- 整个目录 75,120,772 字节（71.64 MiB），797 个文件，包含空 `.env.example`，不含 `.env` 或数据库。
- `_internal` 存放内置 Python、依赖与只读资源；四个动态 provider 显式包含。
- 资源包含完整前端、team.json、Jobs 词表及市场洞察导入所需五份公开 JD 快照。
- EXE 同目录读取 `.env`，默认 SQLite 在同目录 `data/t5.db`；源码仍使用项目根目录。
- Diagnosis 网络 worker 在冻结模式调用同一个 EXE 的内部入口，源码仍用 `python -m`；管道、超时与错误处理保持原行为。

## 实际验证

开发服务原先占用 8000；已临时停止，验证后按原参数恢复。初次误连开发服务的响应不计入验收。
`scripts/verify_windows.py` 增加端口空闲检查，避免复用其他进程的响应。

对原始 dist 和复制后的 `.verification/便携 移动测试` 分别执行独立 EXE 验证：

| 项目 | 两个位置的结果 |
| --- | --- |
| EXE 启动 | 成功；工作目录设为 EXE 的父目录之外 |
| 运行依赖 | PATH 仅保留 Windows System32，移除 Python/T5/DeepSeek 环境覆盖；不调用 Python、uv、Git、Node |
| `/health` / `/ready` | 200 / 200 |
| `/` / `/assets/app.js` / `/demo/sample.json` | 全部 200 |
| 四模块 | resume、jobs、diagnosis、analytics 的 `is_mock` 全为 false |
| `.env` | 无文件时两模块 key 配置为 false；仅写测试占位 key 后均为 true；路径为各自 EXE 目录 |
| SQLite | 各自 EXE 目录生成 `data/t5.db` |
| Diagnosis worker | EXE 私有管道请求本地不可用端口，返回结构化连接/超时错误，无递归启动服务器 |

监听实测为 `127.0.0.1:8000`。launcher 在 Uvicorn lifespan 完成并绑定 socket 后打开默认浏览器。
浏览器插件因安装文件缺失无法连接，改用本机 Edge 无头验证迁移版：页面标题 `T5 · 简历与岗位`、
导航可见、HTTP 200、无 JavaScript pageerror，截图保存在本地 `.verification/portable-frontend.png`。

测试占位 key 与空测试库均从交付目录清理；没有使用或打包真实 Key。本轮不发起付费 AI 调用，
`/ready` 和非 Mock 表示正式入口加载，不能证明用户 Key 有效或外部模型当前可用。
验证机安装有开发工具，已用隔离 PATH 实测运行；没有另做全新 Windows 虚拟机验收。

## 自动化检查

- 完整 pytest：618 passed、39 skipped、2 个已有依赖弃用警告。可选集成/模型测试按既有条件跳过。
- 前端完整测试：77 passed。
- Ruff check、format：通过（114 个 Python 文件格式检查）。
- 四模块公开契约：通过，Resume/Diagnosis 保持离线探测。
- 路径回归：源码与冻结模式分别验证，包含中文/空格目录及共享 Key。
- 初次沙箱运行曾因临时目录权限导致 96 个 pytest setup error、Node spawn EPERM；允许正常临时目录/子进程后完整重跑通过。

构建产物、EXE、ZIP、临时验证文件由 Git 忽略；只提交代码、依赖锁和文档。
