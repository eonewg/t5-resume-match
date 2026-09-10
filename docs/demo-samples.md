# 内置合成演示样例

内置合成简历与 3 个合成岗位样例，可一键填入体验完整流程。

## 入口与操作

“我的简历”上传区域下方的“填入示例简历”只填入原文，并展开文本输入框。
用户自行点击 AI 识别、核对及保存，之后进入“目标岗位”→“添加岗位”，使用“填入示例岗位”按钮：

| 岗位 | 演示方向 |
| --- | --- |
| C++ 后台开发工程师 | 高匹配目标：C++、Linux、网络编程、MySQL/Redis、并发及性能调优 |
| Go 后端开发工程师 | 中等匹配目标：共享后台基础，但 Go runtime、Kubernetes、云原生与消息队列体系存在缺口 |
| 机器学习平台工程师 | 低匹配目标：PyTorch、Transformer、CUDA、训练与 MLOps 等明显不同方向 |

这些是样例设计方向，不是预设分数；实际分数取决于用户确认保存的简历和既有匹配逻辑。
岗位填入会填写名称、原文并清空公司字段，避免沿用旧公司；已有输入会提示确认替换。
填入后需要自行点击“保存并选中”“开始匹配”及“优化”等现有操作。

## 资源与数据边界

唯一内容来源是 `frontend/src/demo/fixtures/`，使用静态 ES 模块导出本地文本：

- `resume-zh.ts`：张浩然，明确标记“合成演示简历 / Synthetic Demo Resume”。保留用户给定的技术细节与数字，去掉聊天尾巴及 Google 跳转，GitHub 只作普通文本展示。
- `job-cpp.ts`、`job-go.ts`、`job-ml.ts`：均标记“合成演示岗位”，不对应真实公司或招聘来源。

人物、腾讯实习经历、奖项与量化成果均为合成演示内容，不是真实人物或履历证明。
fixture 随页面静态模块加载，按钮点击不 fetch、不访问 API、不调用 DeepSeek、
不解析、不保存、不匹配、不诊断。页面原有的历史列表读取保持不变。
fixture 由 Vite 编译进静态产物，便携版仅包含 `frontend/dist`，不复制源码或 node_modules。

不在启动时导入，不放入 holdout/market snapshot。只有用户主动保存岗位才写库，
该表单按 `source_type=synthetic` 提交，不标成真实采样。主动保存后会遵循既有 Analytics
来源筛选：可能出现在“全部来源”或合成数据范围，不能当作真实市场统计样本。
核心算法、AI provider 与业务存储逻辑均未修改，没有引入 Mock AI。

以下为样例引入时的历史验证；React 迁移后的当前验证见 [产品前端迁移记录](frontend-product-shell.md)。

## 验证（2026-09-09）

- `uv run --locked pytest -q`：618 passed、39 skipped、2 个既有依赖弃用警告。
- `uv run --locked ruff check backend tests scripts examples`：通过。
- `uv run --locked ruff format --check backend tests scripts examples`：通过。
- `node scripts/check_frontend.mjs`：85 passed（原 77 项 + 4 个 fixture 语法检查 + 4 个行为测试）。
- 回归直接执行实际页面 mount/click：文本对应、替换取消、重复点击、零新增 API 请求/写入，以及仅主动提交时携带 synthetic 标记。
- Edge 无头浏览器，1440/390 两种宽度：两个页面实际点击填入成功，点击期间新增网络请求为 0，无 JS 错误；手机岗位页面无横向溢出。只读测试响应隔离业务数据，无 AI 调用。

本轮没有调用模型来验证简历解析或诊断质量，不把样例填入测试等同于真实 AI 输出验收。
