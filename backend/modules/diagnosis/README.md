# D：AI 简历诊断模块

负责 DeepSeek 调用、STAR 经历改写、面向 JD 的建议、关键词强化、结构校验、有限重试及内存缓存。
公共入口与现有仓库契约兼容，不修改 A/B/C/E 的代码。

## 接入公共系统

由 A 在根 `.env` 配置（不要提交真实密钥）：

```dotenv
T5_DIAGNOSIS_PROVIDER=backend.modules.diagnosis.public:DiagnosisService
DEEPSEEK_API_KEY=
T5_DIAGNOSIS_MODEL=deepseek-v4-flash
```

`DEEPSEEK_API_KEY` 填本人的模型服务密钥；GitHub 登录凭据不能用于 DeepSeek。
支持进程环境变量或项目根 `.env`，环境变量优先，修改后重启。
配置说明及 A 的待办见 [D 集成说明](../../../../docs/integration_requests/D.md)。

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

## 独立页面与 API

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
独立 API 不写公共数据库，页面整合到公共前端需由 A 安排。

## 配置

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 空 | 真实调用必填，只在服务端读取 |
| `T5_DIAGNOSIS_BASE_URL` | `https://api.deepseek.com` | HTTPS 的 Chat Completions 兼容服务根地址 |
| `T5_DIAGNOSIS_MODEL` | `deepseek-v4-flash` | 模型可替换 |
| `T5_DIAGNOSIS_TIMEOUT_SECONDS` | 30 | 每次网络操作超时，范围 (0,120] 秒 |
| `T5_DIAGNOSIS_MAX_ATTEMPTS` | 3 | 包含首次调用，总尝试次数 1–5 |
| `T5_DIAGNOSIS_MAX_TOKENS` | 4096 | 输出 token 上限，512–8192 |
| `T5_DIAGNOSIS_CACHE_SIZE` | 128 | 每个服务实例的最大缓存条数；0 关闭 |
| `T5_DIAGNOSIS_CACHE_TTL_SECONDS` | 600 | 缓存有效秒数；0 关闭，上限 3600 |

除模型响应字段外，网络层使用 Python 标准库，不新增 OpenAI SDK 或 HTTPX 运行依赖。
切换到非兼容模型可实现 `LLMClient.complete(messages) -> str` 并注入 `DiagnosisService(client=...)`。
仅向官方 DeepSeek 地址发送 `thinking=disabled` 参数，兼容服务不带该扩展。

## 校验与恢复

- 只接受完整 JSON 对象，或单个完整的 JSON Markdown 围栏。拒绝夹杂解释文本的结果。
- 严格校验类型、必填字段、未知字段、条数及长度。响应体和生成文本都有大小限制。
- `original` 必须是简历原文片段，改写不得新增原文没有的阿拉伯数字。
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
uv run --frozen pytest backend/modules/diagnosis/tests tests/core -q
uv run --frozen ruff check backend/modules/diagnosis
uv run --frozen ruff format --check backend/modules/diagnosis
```

测试强制封锁真实 urllib 网络调用。使用脚本化 LLM 和 HTTP 替身验证成功、
鉴权/超时/截断/无效 JSON、缓存 TTL/淘汰/隔离/并发、公共 Provider 装载、
诊断记录读取以及工作流失败不留下半成品记录。
仓库默认 pytest 只收集 `tests/core`，因此请显式带上 D 的测试路径。

可选页面测试：本机有 Playwright 和 Edge、Mock 服务已在 8766 启动时执行
`node backend/modules/diagnosis/tests/browser-smoke.cjs`。
它验证示例流程、STAR 显示、HTML 作为文字显示、窄屏排版和失败恢复；截图写入系统临时目录。

## 已完成验证与真实限制（2026-09-07）

- Python 3.12.14；D 与公共核心共 56 项测试通过，Ruff 检查通过。
- Edge 无界面测试通过，已查看桌面与 390px 手机截图，无横向溢出。
- 测试环境按已有 pyproject 约束安装依赖，并经 `uv sync --frozen` 核对锁文件；未修改根依赖和锁文件。
- 新版 Starlette 测试工具出现 HTTPX / AnyIO 弃用提示，未影响测试；交给 A 统一处理依赖。
- 未提供 DeepSeek 密钥，未进行真实付费模型调用；真实诊断质量、延迟和费用尚未实测。
- 尚未合并 main，也未完成其他成员模块及整套系统验收。

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
