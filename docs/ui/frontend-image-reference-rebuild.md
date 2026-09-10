# 七张参考图驱动的前端重构

2026-09-10；基线 `757cb77bda4e4e578abe3c72581c7beab9ec95d8`，分支 `refactor/frontend-product-shell`。

用户提供七张页面参考图，要求按图完全重构前端，并明确允许丢弃来自另一处、尚未提交的“简历改稿间”视觉修改。本次以这些图片替代上一轮视觉方案。沿用当前维护分支，不创建 PR、不合并；按此前约定不运行浏览器视觉验收，由用户检查最终画面。

## 页面结果

| 页面 | 实现 |
| --- | --- |
| 全局 | 浅蓝工作区、白色固定侧栏、统一线性图标、当前导航背景与边线、顶部搜索和本地用户标记。搜索提交到岗位页，并复用本地列表筛选。设置与帮助入口打开本地说明弹窗，不更改后台配置。 |
| 首页 | 雪山横幅、蓝色主 CTA、四步横向进度、当前简历与目标双卡片、市场洞察三个入口。CTA 随真实准备状态推进。 |
| 我的简历 | 左侧原文、导入方式导航、AI 识别、上传区；右侧字段导航、字段状态、核对与保存。保留完整原文、经历增删、保护字段、识别失败恢复、示例填入、草稿操作与历史版本入口。 |
| 历史简历 | 左侧搜索和版本表，右侧完整版本预览。预览不替换当前简历或脏草稿；明确打开后才加载版本。保留分页、单条删除、清空及关联状态失效逻辑。 |
| 目标岗位 | 当前简历横条、左侧岗位搜索与技能标签列表、右侧 JD 阅读与分析操作。未确认简历时可阅读岗位，匹配按钮禁用；原有新增表单与合成示例仍可使用。 |
| 匹配分析 | 简历与岗位对照横条、雪山分数横幅、已匹配能力与差距双栏、评分依据和下一步建议双栏。Mock 分数仍显示破折号，所有能力与依据来自后端结果。 |
| AI 优化 | 当前简历与岗位信息、建议分类、编号索引、原文和建议并排阅读、解释说明与返回编辑入口。所有建议均可阅读，不自动覆盖简历。 |
| 市场洞察 | 三张实际指标卡、技能数量柱状图与 Top 5、按币种和周期区分的薪资区间、可展开的完整技能频率、默认展开的岗位来源表，保留词云、来源日期筛选和快照导入。 |

窄屏采用单列工作面板、横向导航和可滚动表格；长原文与真实经历不截断。没有更改业务 controller、API、后端、数据库、依赖或模型请求。

## 参考图与实际数据的边界

- 不复制图片中的示例人名、岗位公司、72% 分数、128 条岗位、薪资统计或虚构量化成果。
- 当前 Resume API 没有返回更新时间，因此历史列表显示真实版本 ID 和保存顺序，不捏造日期。
- 当前 JD 没有结构化城市、工作性质、学历等字段，完整原文继续承载这些信息；不添加无数据支撑的筛选器、收藏数和趋势。
- 技能图展示当前样本中的实际岗位数量，不把横轴伪装成六个月趋势。薪资保留原始上下限与独立币种/周期刻度，不画虚构的平滑分布线。
- 图片中的“保存草稿”以已有“确认并保存”流程呈现，仍要求用户核对并验证保存后读取成功。未增加未经核对的后台保存或一键写入 AI 建议。
- 因为没有运行浏览器视觉验收，不声称已经逐像素一致。静态布局和素材已落地，视觉差异由用户检查。

## 验证证据

- `npm --prefix frontend run build`：通过，包含 `tsc --noEmit`，Vite 正常输出 JS、CSS、PNG。
- `npm --prefix frontend test`：63 项逻辑测试和 31 项 React/jsdom 测试全部通过，共 94 项。
- 更新旧标题和双栏重复名称相关测试定位；新增顶部搜索和无简历浏览、导入导航不自动调用 AI、历史预览不替换当前选择或草稿三项回归。
- `.venv/Scripts/python.exe -m pytest tests/core/test_frontend_shell.py -q -p no:cacheprovider`：1 项通过，两条现有 Starlette/httpx/anyio 弃用警告。
- 使用内存 SQLite 的 FastAPI TestClient，从构建 CSS 提取雪山资源路径，实际 GET 返回 200、`image/png`，PNG 签名有效，共 1,721,801 字节。
- `scripts.check_scope --ci`、Prettier 和 `git diff --check` 通过。
- 首次构建和测试受沙箱 `spawn EPERM` 限制；一次提升权限请求因审批服务额度限制被拒绝。用户要求继续后重试成功。没有绕过审批或通过修改生产逻辑规避测试。
- 本轮没有重新验证真实 AI、PostgreSQL、完整后端业务、浏览器布局或 EXE 安装包。

## 图片素材

使用内置 imagegen 生成，已查看生成结果并保存为 `frontend/src/assets/alpine-morning.png`，Vite 打包进 `/assets/`；首页和匹配页共用。无外部图片依赖。

实际生成提示词：

> Use case: photorealistic-natural. Asset type: decorative wide website hero background. Create a panoramic photograph of a majestic snow-covered alpine mountain rising above soft pale clouds, icy blue and white, calm clear morning sunlight. Composition: 3:1 panoramic landscape, main sharp triangular snowy peak at 70% horizontal position, smaller layered snowy ridges along the lower edge, airy pale blue sky across upper half, the entire left 45% mostly empty light mist with very low contrast to allow dark text overlay. Muted high-key pastel powder blue palette, realistic detailed mountain rock and snow. No people, no text, no logos, no typography, no UI, no watermark. Professional serene website background, like an alpine career dashboard banner.
