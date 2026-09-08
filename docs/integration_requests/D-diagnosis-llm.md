# D：多协议 Diagnosis LLM 层与验收（2026-09-08）

## 范围与接入

分支 feat/diagnosis-llm-d 从 origin/feat/core-a ee98378 创建。用户明确要求本阶段新分支，取代本地旧分支约定；未修改 feat/intelligence-d 或 PR #6。
DiagnosisService 仅调用 LLMClient.complete(messages)；create_client 根据协议装载三个 adapter，共享 HTTP、大小限制、错误和安全 metrics。未修改公共 DiagnosisResult、Provider 注册、数据库、Jobs/Embedding、前端、根依赖或 CI。

保留严格 JSON/schema、original 原文片段验证、改写数字保护、STAR 待补充标记、JD 建议边界、有限重试、成功结果 TTL/LRU 缓存和并发合并。数字保护不能证明全部语义真实，仍需人工核实。
缓存身份包含 vendor/style/endpoint/model/effort/prompt version 和原始输入，禁止不同配置结果混用。HTTP 无独立重试；仅服务层默认最多三次（上限五次）。

## 配置与 preset

| vendor | 默认 API style | 默认 base URL | 默认 model |
| --- | --- | --- | --- |
| openai | openai_responses | https://api.openai.com/v1 | gpt-4.1 |
| anthropic | anthropic_messages | https://api.anthropic.com/v1 | claude-sonnet-4-6 |
| deepseek | openai_chat | https://api.deepseek.com | deepseek-v4-flash |
| qwen | openai_chat | https://dashscope-intl.aliyuncs.com/compatible-mode/v1 | qwen-plus |
| custom | 必填 | 必填 | 必填 |

上述模型为可覆盖配置，不代表每个模型/协议组合均已线上验收。

```dotenv
# 服务端本地 .env 示例；密钥占位，不提交真实配置
T5_DIAGNOSIS_PROVIDER=backend.modules.diagnosis.public:DiagnosisService
T5_DIAGNOSIS_LLM_VENDOR=custom
T5_DIAGNOSIS_API_STYLE=openai_chat
T5_DIAGNOSIS_BASE_URL=https://example.com/compatible-mode/v1
T5_DIAGNOSIS_MODEL=your-model
T5_DIAGNOSIS_API_KEY=
# 未确认能力时不要配置 REASONING_EFFORT
```

公共 T5_DIAGNOSIS_PROVIDER 含义不变。新 API_KEY 优先；仅 deepseek 在新 key 为空时兼容 DEEPSEEK_API_KEY，旧 BASE_URL/MODEL 继续可用。未删除旧变量，建议迁移至新变量。环境优先于 .env，重启生效；API key 为 SecretStr，不进入报告、前端或 HTTP 错误信息。

## Endpoint 与响应

chat 自动追加 /chat/completions，responses 追加 /responses，messages 追加 /messages。
base 已以三种完整 endpoint 之一结尾时原样使用，忽略尾斜线；不猜测 custom 的 /v1。
显式 ENDPOINT_PATH 具有最高优先级，是从同一 HTTPS origin 根开始替换路径，例如 base=https://example.com/v1/chat/completions + /v2/complete → https://example.com/v2/complete。
拒绝非 HTTPS、凭据、query/fragment、控制字符、非法端口和危险路径；不跟随 redirect。请求上限 512 KiB、响应 256 KiB，timeout 默认 30 秒。URL/密钥不进入错误消息。

Chat 只取 choices[0].message.content 且 finish_reason=stop；Responses 只取 completed assistant message 的 output_text（排除 reasoning 和 commentary）；Anthropic 拆分顶层 system 与 user/assistant messages，使用 x-api-key、anthropic-version，仅读取 end_turn 的 text blocks，排除 thinking/redacted_thinking。空内容、拒绝、截断和协议缺字段均失败。
已知 preset 可请求 JSON 模式；custom 仅使用严格提示词和原有解析，避免假定供应商支持结构化输出。
401/403 等映射 PermanentLLMError；408/429/全部 5xx、连接/timeout 映射 TemporaryLLMError；输出错误为 InvalidOutputError；配置错误为 ConfigurationError。没有供应商或模型自动切换，没有失败变 Mock。

## Reasoning 能力

内部枚举 none/minimal/low/medium/high/xhigh/max。白名单同时校验 vendor、协议、模型及官方 endpoint host，未知组合默认省略，显式指定则报配置错误。

| 已确认模型 | 允许值 | adapter 参数 |
| --- | --- | --- |
| OpenAI gpt-5.2 | none/low/medium/high/xhigh | Chat reasoning_effort；Responses reasoning.effort |
| OpenAI gpt-5 | minimal/low/medium/high | 同上 |
| Claude sonnet-4-6 | none/low/medium/high | none → thinking disabled；其他 adaptive + output_config.effort |
| Claude opus-4-6 | 上述 + max | 同上 |
| DeepSeek v4 flash/pro | none/low/high/max | Chat thinking + reasoning_effort；Responses reasoning.effort；Messages thinking + output_config.effort |
| Qwen plus | none | enable_thinking=false |
| custom/其他模型 | 未设置 | 不发送；显式指定报错 |

DeepSeek 官方默认保留 none 策略；其他未设置时不发送。没有将不支持档位偷偷映射到其他模型。
依据：[OpenAI GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2)、[GPT-5](https://developers.openai.com/api/docs/models/gpt-5)、[Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort)、[DeepSeek thinking](https://api-docs.deepseek.com/guides/thinking_mode/)、[Qwen compatible API](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)。仅白名单范围受支持，不声称覆盖全部厂商模型。

## 真实验收

执行 `uv run --locked python -m tests.diagnosis.accept_live --output .verification/diagnosis-live.json`。离线 pytest 不执行该入口；使用 fake transport 覆盖三协议验收脚本。真实验收显式调用本机 .env，报告不含密钥、endpoint 或 thinking 内容。

使用合成简历（Python/SQL、清洗 120 条课程记录）及数据分析 JD，经公共 Resume preview/save → JD save → Match → Diagnosis workflow，HTTP 201、is_mock=false。

| 项目 | 实际结果 |
| --- | --- |
| vendor / style / model | custom / openai_chat / glm-5.2（用户提供百炼 endpoint） |
| 完整 workflow latency | 51.063 秒 |
| 请求/重试 | 2 次请求，1 次重试；首轮 error 耗时 30.125 秒，未记录足以细分错误类别的指标 |
| 成功请求 latency | 19.938 秒 |
| 成功请求 tokens | input 778 / output 1418；失败请求 usage 未返回，不能计算完整用量或费用 |
| 结构/事实边界 | 严格 JSON、schema、原文引用、数字检查通过；保留 120，缺背景/成果用待补充 |
| 业务内容 | 返回 STAR 改写、JD 分析说明 gap、建议与风险提醒；未把缺失经历当事实 |

本次基础调用未发送 reasoning 参数。其余供应商仅完成确定性离线协议测试，未声称线上通过。单样本不能外推模型质量/准确率。

用户随后授权独立探测：同一 endpoint 单次 reasoning_effort=low 请求返回有效简单 JSON，2.703 秒，input 20/output 128，无重试。未修改生产 adapter、.env 或 capability 白名单。[百炼 GLM 文档](https://www.alibabacloud.com/help/zh/model-studio/glm)描述支持 reasoning_effort，但 HTTP 接受参数不能证明档位效果，未测试全部档位；custom 生产默认仍省略。

## 回归与 A 集成请求

- 全量 Python：352 passed，真实 PostgreSQL 17.6/pgvector 0.8.1 环境，无 skip，包含 Jobs/Embedding/事务/缓存回归。
- Diagnosis：149 passed（保留旧 44 项，新增 105 项），包含三协议请求/响应、错误、URL、兼容、事实/缓存和 fake 全链路。
- 前端：33 passed；Ruff check 与 format check 通过（81 Python 文件）。
- diagnosis/jobs 成员自检通过；单独无 PG 环境的成员命令会 skip 数据库用例，以上全量 PG 回归已实际覆盖。
- Edge 浏览器 Mock smoke：示例流程、STAR、XSS 文本显示、390px 布局、失败恢复通过；浏览器不是收费 API 验收证据，真实工作流通过公共 HTTP TestClient 完成。
- 两个既有 FastAPI/Starlette 依赖弃用警告未改公共依赖。

**A 需处理新分支 CI allowlist**：scripts/member_specs.py 的 D 分支仍固定 feat/intelligence-d，check_scope --ci 对本次用户指定 feat/diagnosis-llm-d 明确失败；workflow push trigger 也仅列旧分支。请 A 将本次 D 新分支纳入允许集，保留 D 路径约束及 base=feat/core-a 检查，不放宽测试。D 未修改公共 scripts/CI，也不伪报该 CI 门禁已通过。除此之外无需新公共 Schema/API/数据库集成。
