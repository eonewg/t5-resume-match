# 当前 AI Provider 与迁移验证

2026-09-09，从最新、干净的 main `f2053e61bba078b42ff04fc7b1c22947133a9606`
创建 `chore/deepseek-official-unify`。本轮仅收口 Provider、配置、短 Prompt 示例及对应测试/当前文档。

| 模块 | Provider | Base URL | Model | 协议与 JSON | Thinking |
| --- | --- | --- | --- | --- | --- |
| Resume | DeepSeek official | `https://api.deepseek.com` | `deepseek-v4-flash` | `chat_completions`，`json_object` | 显式 disabled，max_tokens=4096 |
| Diagnosis | DeepSeek official | `https://api.deepseek.com` | `deepseek-v4-flash` | `openai_chat`，JSON mode=true | 沿用现有 capability：未配置 effort 时 none；本地明确 none |

两者 endpoint 均为 `https://api.deepseek.com/chat/completions`，发送
`response_format={"type":"json_object"}`。Diagnosis 复用既有 preset、HTTP client 和
reasoning 映射；已有显式受支持 effort 优先，不提高默认推理强度。
协议依据：[官方 Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、
[官方 thinking 说明](https://api-docs.deepseek.com/guides/thinking_mode/)。

普通用户仅需本地 `.env` 中的 `DEEPSEEK_API_KEY`。
Resume 优先 `T5_RESUME_LLM_API_KEY`，Diagnosis 优先 `T5_DIAGNOSIS_API_KEY`；
模块密钥未设置或为空时，官方 DeepSeek 配置使用共享密钥。显式 legacy/custom 不借用官方密钥。
无 Key 可启动，AI 请求明确报配置失败，不静默切换 Mock、Ling 或 SiliconFlow。

正式默认和本地运行均不再依赖 Ling / SiliconFlow。为避免破坏显式旧配置，
custom Ling 的非思考兼容能力及测试保留；它不是默认或失败回退路径。
Resume 将该逻辑移入配置 capability，官方 DeepSeek 非思考能力同时限定 vendor、host、model、协议。

Resume 保留严格 JSON、重复键/非有限数拒绝、ExtractedFacts strict schema、ResumeData 校验、
缺失字段空值、服务端原样注入 raw_text、用户核对后保存。仅增加空 JSON 结构示例，未恢复已删除事实守卫。
Diagnosis 的 client/config/capabilities/schema/service 均未修改，STAR 子串与数字守卫、逐项过滤、
错误分类、其他建议、重试/超时及日志边界保持原样。Jobs、Matching、Analytics、数据库核心未修改。

## 验证结果

- `uv run --locked pytest -q --basetemp .verification/deepseek-full-tests`：625 passed，零跳过，2 条既有依赖弃用警告；连接本地 PostgreSQL 执行全部数据库回归。
- `uv run --locked ruff check backend tests scripts examples`：PASS。
- `uv run --locked ruff format --check backend tests scripts examples`：PASS（110 files）。
- `node scripts/check_frontend.mjs`：77 passed。
- `uv run --locked python -m scripts.smoke_postgres`：PASS，扩展、迁移、索引、向量读写与 Resume → JD → keyword match。
- 最初沙箱运行遇到 pytest 临时目录权限和 Node spawn EPERM；正常本地权限下上述检查通过。

离线检查全部通过后，使用合成简历与合成 JD，各执行一次真实模型业务调用，无追加或重试。
仅本次验证将 Diagnosis max_attempts=1、output_retries=0、cache_size=0，未改变生产重试默认。

| 模块 | Provider / model / host | 上游 HTTP | finish_reason | 模型调用耗时 | 结果 |
| --- | --- | --- | --- | --- | --- |
| Resume | DeepSeek official / deepseek-v4-flash / api.deepseek.com | 200 | stop | 1.678 s | API preview 200；JSON/strict schema 通过；raw_text 原样；合成字段逐项核对无虚构 |
| Diagnosis | DeepSeek official / deepseek-v4-flash / api.deepseek.com | 200 | stop | 6.649 s | API 201；JSON/schema/fact guard 通过；1 条 STAR；original 子串及数字检查通过；输出数字均来自输入；保存后 GET 200 |

验证通过 FastAPI TestClient 调用真实应用路由和真实上游模型，使用临时 SQLite 隔离业务记录。
没有本轮浏览器手动视觉验收；前端证据为现有 77 项离线测试，不能据此宣称重新验证了全部 UI。
两份合成输入仅证明本次链路与约束通过，不是扩大模型质量评测。

本地 `.env` 只迁移 Resume/Diagnosis 配置，清空旧供应商模块密钥，保存一份共享官方 Key；
其他配置保持原样。`.env` 被 Git 忽略且未跟踪；不提交 Key、Authorization、原始 reasoning 或完整模型响应。
历史 SiliconFlow 验收记录保留，Diagnosis README 的历史段落仅标注为历史，未改写既有调用事实。

## PR 边界

目标为 `chore/deepseek-official-unify → main`，不自动合并。
PR #14 后续已更新维护 CI 政策：main push 及常规维护分支 → main 不再依赖旧 A/D 拓扑；
全部 Git 跟踪文件的交付禁项与大小检查保留，四模块契约检查始终执行。
旧 D 目录 scope 作为显式本地工具保留，详见 [团队维护流程](team-rules.md)。

CI 政策修订本地验证：111 项成员/分支/交付禁项测试通过；全量 655 passed（含 PostgreSQL，
2 条既有依赖警告），77 项前端测试、Ruff check/format、PostgreSQL smoke 与四模块契约检查通过。
本次 CI 修订未改 DeepSeek 业务实现，也未追加真实模型调用。
