# 开发验证

## 运行检查

从 feat/core-a 使用锁定依赖运行：

```powershell
uv sync --locked
uv run --locked pytest -q
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
node scripts/check_frontend.mjs
```

自检以 resume、jobs、diagnosis、analytics 为参数。带 --examples 时验证共享合成样例；真实模块自检去掉该参数。diagnosis 默认离线，不构造模型客户端。

CI 运行 Windows/Ubuntu × Python 3.11/3.13，D 分支要求 Jobs/Matching 和 Diagnosis 两个模块；A/main 检查当前已存在模块，不能把未实现模块视为 PASS。分支、目录和模块映射统一来自 scripts/member_specs.py。

## 验证边界

现有测试覆盖公共 API、Mock 流程、持久化、关联 ID、事务回滚、provider 契约、前端调用与生命周期、Diagnosis 离线故障处理及 A/D 工作流限制。共享 examples/providers/ 四个示例用于当前模块契约和公共 Mock 演示，不是独立 owner 交付。

PostgreSQL/pgvector、真实模型质量与延迟、完整 T5 浏览器演示、最终版本的 clean clone / fresh install 仍需独立验证。模块完整状态见 [验收台账](acceptance.md)。自动测试通过不代表这些项目已完成。

Windows 如遇 uv 缓存访问限制，可设置 UV_CACHE_DIR 为项目 .verification/uv-cache。pytest 临时目录或 Node 子进程权限受限时，需要在允许相应本地操作的执行环境运行，不能通过删测试规避失败。

## 本次结果

2026-09-07，feat/core-a 工作区：

- uv sync --locked：通过。
- pytest：76 passed，2 项既有 Starlette HTTPX/AnyIO 弃用提示。
- Ruff check：通过；format --check：42 个文件通过。
- 前端检查：24 passed。
- 四模块样例和 A 分支 CLI/CI 模式检查通过（Diagnosis 为 OFFLINE）。
- 当前文件职责扫描、65 个本地 Markdown 链接、git diff --check 通过。
- 当前 A/D 映射、D 双模块要求、未知分支拒绝、PR 方向及目录边界均有回归覆盖。

本轮不调用真实 AI，不执行数据库功能升级或模块集成；上表结果只覆盖自动化开发检查。
