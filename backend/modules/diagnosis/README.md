# Diagnosis 模块

开发期曾使用 `feat/diagnosis-llm-d → feat/core-a`；当前从 main 创建维护分支并向 main 提 PR。D 维护三协议 LLM 层、STAR/JD 诊断、事实边界校验、重试和缓存；公共契约与数据库保持不变。

完整配置、能力表和真实验收见 [多协议验收记录](../../../docs/integration_requests/D-diagnosis-llm.md)。

当前正式运行统一使用 DeepSeek 官方 `https://api.deepseek.com`、`deepseek-v4-flash`、OpenAI Chat JSON Output。无密钥可启动，但 AI 请求明确失败；不自动切换其他供应商或 Mock。默认沿用非思考策略，显式受支持 effort 保持有效。见 [当前迁移说明](../../../docs/current-provider.md)。

## 接入公共系统

由 A 在根 `.env` 配置（不要提交真实密钥）：

```dotenv
T5_DIAGNOSIS_PROVIDER=backend.modules.diagnosis.public:DiagnosisService
DEEPSEEK_API_KEY=
T5_DIAGNOSIS_LLM_VENDOR=deepseek
T5_DIAGNOSIS_JSON_MODE=true
T5_DIAGNOSIS_REASONING_EFFORT=none
T5_DIAGNOSIS_MODEL=deepseek-v4-flash
```

`DEEPSEEK_API_KEY` 填本人的模型服务密钥；GitHub 登录凭据不能用于 DeepSeek。
支持进程环境变量或项目根 `.env`，环境变量优先，修改后重启。
配置说明及 A 的待办见 [D 集成说明](../../../docs/integration_requests/D-integration.md)。

```python
from backend.modules.diagnosis.public import DiagnosisService
from backend.schemas.contracts import DiagnosisInput

service = DiagnosisService()  # 建议每个进程复用同一个实例，以复用缓存
result = service.diagnose(
    DiagnosisInput(
        resume_text="课程项目：使用 Python 清洗数据，使用 SQL 汇总统计结果。",
        jd_text="数据分析实习生，要求 Python、SQL 及清晰的分析表达能力。",
    )
)
print(result.model_dump())  # 只有 summary、suggestions，符合公共 v1 契约
```

`diagnose_detail` 提供模块自己的丰富结构，包含 `summary`、`star_rewrites`、
`jd_targeted_suggestions`、`keywords_to_strengthen`、`risks`。
公共 `diagnose` 将丰富结构转换为带中文类别标签的 `suggestions`，保留 STAR 原文、优化文和理由。
公共 `/api/v1/diagnoses` 仍接收 `resume_id + jd_id` 并持久化，由 A 已有路由负责。

## 最新公共前端接入

已同步 `origin/main` 的 `c209eb0` 公共开发支持。正式交付入口是
`frontend/src/modules/diagnosis/index.js` 导出的 `mount(container, context)`。
启动公共 `backend.main:app` 后访问 `/?preview=diagnosis#diagnosis`。
先在工作台选择简历/JD，再进入 AI 诊断页，使用公共 `/api/v1/diagnoses` 生成和保存结果。
组件只读公共状态、订阅选择变化、使用共享 API；不更改公共注册表、Schema 或路由。
切换页面释放订阅，忽略取消或选择改变后的迟到响应；输入与模型结果均以纯文本显示。
结果级 `is_mock` 与 API 的 Mock 标记合并显示，Provider 为真实实现不代表密钥已验证。
公共注册表已挂载该模块，预览入口也可独立用于调试。

## 独立调试页面与 API

在仓库根目录安装项目及已有开发依赖：

```powershell
uv sync --frozen
```

无需密钥的明确 Mock 演示：

```powershell
uv run --frozen uvicorn backend.modules.diagnosis.web:create_demo_app --factory --host 127.0.0.1 --port 8766
```

浏览器访问 `http://127.0.0.1:8766`，点击“填入示例”“开始诊断”。
页面和响应始终标记 Mock；其内容仅验证结构和操作，不代表实际模型效果。

真实模式（先配置密钥）：

```powershell
uv run --frozen uvicorn backend.modules.diagnosis.web:create_app --factory --host 127.0.0.1 --port 8766
```

独立 `POST /api/diagnose` 接收 `resume_text + jd_text`，返回
`{"is_mock":false,"result":{...丰富诊断结构...}}`。
缺密钥返回 503，模型调用或输出错误返回 502，非法输入返回 422。
失败不会自动切换 Mock；页面清除旧结果、显示错误并恢复按钮。
独立 API 不写公共数据库；最新公共页面已按上节接入共享壳，不依赖独立服务器。

## 配置

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `T5_DIAGNOSIS_LLM_VENDOR` | deepseek | openai / anthropic / deepseek / qwen / custom |
| `T5_DIAGNOSIS_API_STYLE` | preset 决定 | openai_chat / openai_responses / anthropic_messages |
| `T5_DIAGNOSIS_API_KEY` | 空 | 模块覆盖密钥，优先于共享密钥，仅服务端读取 |
| `DEEPSEEK_API_KEY` | 空 | 官方 DeepSeek 共享密钥，可同时驱动 Resume；模块变量优先 |
| `T5_DIAGNOSIS_ENDPOINT_PATH` | 未设置 | 根相对路径覆盖，例如 /v2/messages |
| `T5_DIAGNOSIS_REASONING_EFFORT` | 未设置 | 仅已确认模型能力允许设置，否则配置错误 |
| `T5_DIAGNOSIS_BASE_URL` | `https://api.deepseek.com` | HTTPS 地址；默认由 preset 决定，custom 必填 |
| `T5_DIAGNOSIS_MODEL` | `deepseek-v4-flash` | 模型可替换 |
| `T5_DIAGNOSIS_TIMEOUT_SECONDS` | 30 | 每次网络操作超时，范围 (0,120] 秒 |
| `T5_DIAGNOSIS_MAX_ATTEMPTS` | 3 | 包含首次调用，总尝试次数 1–5 |
| `T5_DIAGNOSIS_MAX_TOKENS` | 4096 | 输出 token 上限，512–8192 |
| `T5_DIAGNOSIS_CACHE_SIZE` | 128 | 每个服务实例的最大缓存条数；0 关闭 |
| `T5_DIAGNOSIS_CACHE_TTL_SECONDS` | 600 | 缓存有效秒数；0 关闭，上限 3600 |

除模型响应字段外，网络层使用 Python 标准库，不新增 OpenAI SDK 或 HTTPX 运行依赖。
三种 adapter 统一实现 `LLMClient.complete(messages) -> str` 并注入 `DiagnosisService(client=...)`。
默认保留官方 DeepSeek 非思考策略；其他 reasoning 映射由 adapter 与能力白名单控制，custom 默认不发送扩展参数。

## 校验与恢复

### SiliconFlow 历史接入（既有验收事实，非当前配置）

复用 `custom + openai_chat`，无专用客户端或新增 SDK。配置
`T5_DIAGNOSIS_LLM_VENDOR=custom`、`T5_DIAGNOSIS_API_STYLE=openai_chat`、
`T5_DIAGNOSIS_BASE_URL=https://api.siliconflow.cn/v1`、
`T5_DIAGNOSIS_JSON_MODE=true`，endpoint 自动成为
`https://api.siliconflow.cn/v1/chat/completions`。
`T5_DIAGNOSIS_MODEL` 与 `T5_DIAGNOSIS_API_KEY` 必须由用户提供；本轮不自动读取、
选择或持久化新的模型与凭据，写本地 `.env` 需用户另行明确同意。

`JSON_MODE` 仅适用于 OpenAI Chat：true 发送 `response_format={"type":"json_object"}`，
false 不发送；未配置时保留原供应商默认行为。模型 JSON mode 后仍执行本地严格
Pydantic schema、STAR 原文与数字校验；错误分类和真实失败不转 Mock 的行为保持。
`stream=false`，model 动态传入，不为 SiliconFlow 猜测模型或额外思考参数。

迁移原因是 Ling3-flash 对部分真实 Resume/JD 组合返回 `content_filter`。
此识别逻辑继续保留；Resume 的 Ling3-flash 配置和实现不变。
用户已提供模型与凭据并授权保存到未跟踪 `.env`。最终 Diagnosis 为
`SiliconFlow / deepseek-ai/DeepSeek-V4-Flash`。2026-09-09 逐条事实保护修复后，
极简、原过滤真实组合、另一正常组合各一次，三组均 HTTP 200/stop、schema 通过。
原真实组合保留 1 条合法 STAR、过滤 1 条数字违规 STAR，其他诊断字段正常返回。
GLM-5.3 历史单次 85.355 秒读取超时保留，本轮未测试或切换；无 fallback。
见 [实际调用记录](../../../docs/final/diagnosis-siliconflow.md#逐条-star-严格校验与最终验收)。
本轮每组一次，`MAX_ATTEMPTS=1`、`OUTPUT_RETRIES=0`、禁用缓存；仅记录脱敏指标。

接口依据：[SiliconFlow 官方文档](https://docs.siliconflow.cn/docs/api/chat-completions-post)。

### 现有保护

- 只接受完整 JSON 对象，或单个完整的 JSON Markdown 围栏。拒绝夹杂解释文本的结果。
- 严格校验类型、必填字段、未知字段、条数及长度。响应体和生成文本都有大小限制。
- `original` 必须是简历原文片段，改写不得新增原文没有的阿拉伯数字。
- 数字以当前 STAR `original` 为来源，不借用简历其他片段。先严格校验整份 schema，
  再逐条过滤非原文或新增数字的 STAR；全部过滤时返回空数组，其他字段保留。
  成功请求日志记录 `fact_guard_original` / `fact_guard_number` 过滤数量，不记录正文，
  不标记为请求失败、不自动重试；原文失败优先计数，每条只计一次。
  仅过滤发生且 risks 未满 10 条时追加简短提示；保留原有风险，不重复提示或突破 schema。
  不使用模糊匹配或内部空白归一化；首尾空白继续按 schema 既有规则去除。
- STAR 缺失内容使用“待补充”，不补造技能、公司、职责、效果数字；没有经历可返回空改写数组。
- 空输出、截断、解析或结构错误、超时、连接失败、408/429/常见 5xx 共享一个有限重试预算。
- 默认最多 3 次，间隔 1 秒、2 秒；格式失败追加修复提示。401、402 等配置/鉴权问题不重试。
- 缓存只存成功结果，用输入、模型、服务地址和提示词版本的 SHA-256 作为键。
- TTL + LRU 限定内存，锁防止相同并发输入重复调用；返回深拷贝，调用者修改不会污染缓存。
- 不保存密钥、简历或模型输出到磁盘/日志；内存缓存有诊断结果，进程重启后失效。

数字及原文检查只能拦截部分虚构，不能证明语义完全真实；中文数字、能力归属和因果关系仍需人工核实。
缓存是单进程的，不是分布式缓存。网络超时是 I/O 超时，不是整个请求的绝对截止时间。

## 测试

```powershell
uv run --locked python -m scripts.check_member diagnosis
uv run --locked pytest -q
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
node scripts/check_frontend.mjs
```

测试强制封锁真实 urllib 网络调用。使用脚本化 LLM 和 HTTP 替身验证成功、
鉴权/超时/截断/无效 JSON、缓存 TTL/淘汰/隔离/并发、公共 Provider 装载、
诊断记录读取以及工作流失败不留下半成品记录。
模块测试位于 `tests/diagnosis`，默认 pytest 和模块自检都会收集。

可选页面测试：本机有 Playwright 和 Edge、Mock 服务已在 8766 启动时执行
`node tests/diagnosis/browser-smoke.cjs`。
它验证示例流程、STAR 显示、HTML 作为文字显示、窄屏排版和失败恢复；截图写入系统临时目录。

## 当前验证边界

离线测试覆盖公开 provider、持久化、工作流回滚及模型失败处理；最新实际结果见 [验证记录](../../../docs/validation.md)。

2026-09-08 已完成 custom / openai_chat / glm-5.2 的真实完整工作流验收，51.063 秒、1 次重试；详见多协议验收记录。其余协议只有离线验证，不能据此声称全部供应商线上验收。

## 个人报告可使用的实际开发记录

1. 输入截图建议丰富 JSON，但公共仓库只允许 summary/suggestions；采用模块内丰富结构与公共适配输出，避免修改公共 Schema。
2. 对不稳定输出增加结构校验和修复提示；用无效 JSON、空内容及截断替身验证恢复，没有伪称线上模型发生故障。
3. 超时与解析失败原本可能形成多层重试，因此仅由服务层统一控制总次数，测试混合失败仍最多 3 次。
4. 对相同请求采用 TTL/LRU 缓存和并发锁，用并发测试确认成功请求只调用一次模型。
5. 首轮超长参数测试出现测试准备阶段错误，改为显式短 ID 后全套通过，避免生成超长用例名称。
6. 人工审查重点：不编造经历、严格公共契约、失败不能伪装成功、前端不使用 innerHTML 渲染模型输出。
7. 当前只有一个提示词版本和离线故障测试，没有真实模型提示词 A/B 对比数据；报告不能编造效果提升百分比。

协议依据：[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、
[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)（2026-09-07 核对）。
