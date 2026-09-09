# Diagnosis SiliconFlow 迁移记录

2026-09-09，分支 `feat/core-a`，起点 `003050100023dc5c19c828bc28542fe4fcc9f599`。

## 当前结果

**本轮 Diagnosis 最终验收通过。** 逐条严格校验、过滤违规 STAR 后，三组 DeepSeek
各一次均返回可用结果，原 content_filter 组合保留合法内容并安全过滤数字违规条目。
最终 Diagnosis 为 `SiliconFlow / deepseek-ai/DeepSeek-V4-Flash`。
下文保留历史失败、GLM 超时及对应阶段结论；最新结论见文末逐条 STAR 验收。
用户要求停止继续针对 Ling3-flash 的 content_filter 调整 Prompt，改为单独迁移 Diagnosis。
首轮迁移未继续改 Prompt；后续事实保护定位阶段的最小强化见下文。Resume 实现与配置均未修改。

复用 custom + openai_chat，新增可选 `T5_DIAGNOSIS_JSON_MODE`：true 显式请求
JSON object；false 关闭；未设置保留旧行为。仅允许用于 openai_chat。
不新增 HTTP 客户端、SDK、依赖、模型默认值或自动 fallback。
详见 [模块配置](../../backend/modules/diagnosis/README.md#siliconflow-接入最终候选已验收)。

## 首轮离线验证

- Diagnosis 定向 pytest：229 passed。
- Python 全量 pytest：562 passed、39 skipped，2 个依赖弃用 warning；跳过的可选集成项不算通过。
- frontend：77 passed、0 skipped。
- Ruff check 与 format --check：通过。
- endpoint（含尾斜杠和完整 endpoint）、假 Key Bearer、动态 model、环境开关、JSON mode、stream=false、成功提取均已验证。
- JSON mode 不绕过 content_filter、length、空 content、非 stop、invalid envelope/JSON；业务层仍拒绝 schema 错误、非原文 STAR 和新增数字。
- 既有三协议/provider 回归仍通过。所有新增协议测试均使用 fixture，无真实模型请求。

本阶段变更文件：`.env.example`、Diagnosis `config.py`、`client.py`、`README.md`、
`tests/diagnosis/test_protocols.py`、`scripts/verify_diagnosis_migration.py`、本记录及脱敏调用证据。
client 的 finish_reason 观测延续同一任务此前改动。

## 首轮真实验收：3 次调用后停止

用户在对话中提供 model 与 Key，并明确授权保存。已保存到 Git 忽略、未跟踪的本地 `.env`，
仅修改 Diagnosis 项，其他配置逐行比对保持一致。无密钥进入 Git、测试或证据。
vendor=`custom`、provider=SiliconFlow、api_style=`openai_chat`、JSON_MODE=true。
每次禁用重试与缓存；单次上限 90 秒。未修改当前 Prompt。

| 调用 | HTTP | finish_reason | 耗时 | 业务结果 |
|---|---|---|---|---|
| 最小 API smoke | 200 | stop | 1.237 s | content 非空，有效 JSON |
| A：极简合成简历/JD | 200 | stop | 10.456 s | schema、原文和数字保护通过，1 条 STAR |
| B：原 Ling content_filter 真实组合 | 200 | stop | 15.099 s | schema 通过，fact_guard 拒绝；未生成有效诊断 |

B 的两项输入 SHA-256 与旧记录完全一致。`fact_guard` 在当前实现中仅在 JSON/schema
验证后由 STAR 原文不属于输入或新增数字触发，因此 schema 通过是根据已捕获执行阶段确认。
该次证据未区分这两个子原因，不推测具体是哪一项；后续脚本已补充无敏感正文的原因枚举，
未为补证据重复真实调用。原始 3 次记录保持不改写，见 [脱敏证据](evidence/diagnosis-siliconflow-20260909.json)。

结论：接口、鉴权与模型可调用性正常；原 content_filter 在这一次新调用未重现，但业务输出
没有满足现有事实约束。这是本次模型输出合规性失败，不能据一次结果推断稳定失败率或语义虚构。
根据用户停止条件，C 另一正常组合及真实浏览器调用未执行，没有自动尝试其他模型或降级 Mock。
建议经用户选择后尝试官方提供的 `Qwen/Qwen3.5-397B-A17B`，此处仅列候选，不声称已验证。
当前不能进入宣称 Diagnosis 最终通过的项目收尾；等待用户指定下一模型，可沿用已提供 Key。

## 同一任务此前的 Ling 排查

此前 14 次 Ling 单次实验完整保留在 [脱敏记录](evidence/diagnosis-filter-20260909.json)，
包含旧/新 Prompt 与输入拆分测试，不计入 SiliconFlow 的 3 次。用户切换目标后未再调整 Prompt。
此前前端改动补充 content_filter 解释与返回编辑入口，显式重新提交才恢复，不自动重试。
离线浏览器已验证错误后修改/保存选择、显式重新提交恢复；它不代表 SiliconFlow 真实浏览器通过。

## 事实保护定位与最终候选复核

本轮基线 `803f6d7`，用户要求优先保留 DeepSeek-V4-Flash，仅在最小修正仍不满足事实约束时
对照 `zai-org/GLM-5.3`。没有额外选择其他模型，没有读取或输出 Key。

### 具体原因及保护边界

上一轮只记录 fact_guard，未保留模型正文，不能回溯认定上一轮的精确子原因。
本轮增加 `FactGuardError` 的 `guard_reason` 与结构化脱敏诊断：
`original_not_in_resume` 和 `unsupported_number`。服务日志与验收证据携带具体原因，
仍以 fact_guard 作为不重试的阶段；不记录原文、输出片段、具体数字或凭据。

保持原 Prompt 的一次定位调用发现第一条 STAR 引用不是精确子串。
首尾空白原本已被 Pydantic 去除；只统一 CRLF/LF 仍不能匹配，统一内部空白后能匹配。
这表明此次引用改变了内部空白格式。该归一化只用于诊断，不参与接受条件。
现有 Prompt 要求逐字引用，没有证据说明当前判定比约定更严格，因此不放宽 guard。

数字继续以当前 STAR original 为基准。若使用整份 resume_text，会允许把另一条经历的
规模、年限或效果数字移入当前改写。新增离线反例覆盖“甲项目 10 条，乙项目 500 条”，
确认不能把甲项目改写成 500 条。精确引用、数字不新增的判定均保持不变；不使用模糊匹配。

Prompt 仅增加两句：original 连续复制并保留内部空白，不合并行或拼接；optimized 数字
只来自本条 original，不借用其他片段/JD，不插入数字序号或示例数字。版本从
`d-v2-career-context` 更新为 `d-v3-exact-star`，schema 与其他事实要求保持。

### 本轮 6 次真实调用

全部单次，无模型自动重试；测试单次上限 90 秒、读取上限 85 秒。
详见 [原始脱敏记录](evidence/diagnosis-fact-guards-20260909.json)，此前所有证据保持不改写。

| 调用 | 模型 | HTTP / finish_reason | 耗时 | 结果 |
|---|---|---|---|---|
| 定位：原 Prompt + 真实组合 | DeepSeek-V4-Flash | 200 / stop | 16.953 s | 第 1 条 original_not_in_resume；内部空白差异 |
| A：极简组合 | DeepSeek-V4-Flash | 200 / stop | 8.492 s | schema、STAR original、数字保护全部通过；1 条 STAR |
| B：原过滤真实组合 | DeepSeek-V4-Flash | 200 / stop | 13.436 s | schema 通过；第 2 条 unsupported_number |
| C：另一正常组合 | DeepSeek-V4-Flash | 200 / stop | 10.341 s | schema、STAR original、数字保护全部通过；1 条 STAR |
| B 的最小对照 | GLM-5.3 | 未取得 / 未取得 | 85.355 s | read timeout，未取得可校验输出 |
| 真实浏览器，隔离合成样本 | DeepSeek-V4-Flash | 上游 200 / stop，产品 API 201 | 80.753 s | 服务校验及页面流程通过；一次 POST，未调用 Resume |

B 与历史输入的两个 hash 完全一致。最小强化后，第 2 条 STAR 含 1 个本条 original
不存在的数字，该数字存在于简历其他位置；这是数字来源约束未满足，不能据此断言具体
业务事实被虚构。此次在第 2 条数字保护处终止，不把未检查的后续条目计为通过。
它与此前定位调用均未满足事实约束，因此按用户条件执行一次 GLM 对照；不把少量结果
表述为稳定失败率，也没有为“撞成功”重放相同请求。

GLM 读取超时仅说明本次调用未完成，不等于模型不存在或能力不合格。未重试、不扩大
benchmark、不将本地配置切为未验证的 GLM。当前 DeepSeek 配置亦不能称为最终验收通过。

### 验证与结论

- Diagnosis：237 passed。
- Python 全量：570 passed、39 skipped，2 个依赖弃用 warning；跳过项仍非通过证据。
- frontend：77 passed；Ruff check 与 format --check 通过。
- 内置浏览器插件缺少运行组件，改用本机独立 Edge/Playwright。运行实际产品页面、
  API 和 DiagnosisService，以隔离内存数据库的已确认合成简历与岗位生成一次真实结果。
  桌面与 390px 界面均检查，无横向溢出，展示真实结果及 STAR；Resume 模型调用数为 0。
- 浏览器通过仅证明此次页面与服务链路可用。原文/数字 guard 也不能证明所有语义事实
  正确；例如浏览器输出补充了来源未明确提供的数据问题与处理细节，仍需人工核实。
- **不能进入宣称 Diagnosis 最终验收通过的收尾。** DeepSeek 三组没有全部通过，
  GLM 对照未取得成功证据；最终模型方案尚未确认，当前配置保留 DeepSeek。不合并 main。

## 逐条 STAR 严格校验与最终验收

2026-09-09，修复基线 `1d0bd80a30e8786ae8a39b7441f321abac09b7bb`，仅 `feat/core-a`。

### 问题与最终行为

Ling3-flash 对特定输入发生 content_filter；SiliconFlow / DeepSeek-V4-Flash 已解决该
组合的上游过滤。此前整份业务失败来自其中一条 STAR 的本条原文以外数字，失败粒度过粗。
本轮先严格验证完整 JSON/schema，再逐条验证 STAR：original 仍须是简历精确子串，
optimized 的阿拉伯数字集合仍须是本条 original 的子集。没有放宽事实保护，没有改 Prompt
（仍为 `d-v3-exact-star`，hash 与上一轮一致），不使用模糊匹配、embedding 或编辑距离。

原文违规或数字违规条目丢弃，合法 STAR 按原顺序保留；全部违规也返回空数组。
summary、岗位建议、keywords、risks 均保留。成功请求事件增加 `fact_guard_original` 与
`fact_guard_number` 两类过滤条数，原文失败优先计数，每条只计一次；无敏感正文/具体数字。
过滤不作为请求错误，也不触发模型重试。仅确有过滤且风险列表未满 10 条时追加提示，
已有提示不重复；已满时保留全部原风险，过滤计数仍可观测。公共 schema / 前端无需修改。

非法 JSON、schema/必填字段/类型错误、异常响应、content_filter、truncated、HTTP/timeout
继续走原有整份失败与错误分类路径，既有可选 JSON 修复配置不变，未对这些错误局部容错。

### 本轮三组真实验证

每组一次，真实 `DiagnosisService`，无缓存、无重试。脱敏原始指标见
[本轮证据](evidence/diagnosis-star-filter-20260909.json)，未覆盖历史记录。

| 组合 | HTTP / finish_reason | 耗时 | STAR 结果 | 其他内容 |
|---|---|---|---|---|
| 极简正常 | 200 / stop | 9.285 s | 保留 1，过滤 0 | summary、5 条岗位建议、7 个关键词、4 条风险 |
| 原 content_filter / fact_guard 真实组合 | 200 / stop | 16.775 s | 保留 1，数字违规过滤 1，原文违规 0 | summary、8 条岗位建议、10 个关键词、6 条风险（含过滤提示） |
| 另一正常组合 | 200 / stop | 8.124 s | 保留 1，过滤 0 | summary、5 条岗位建议、6 个关键词、3 条风险 |

三组 schema 均通过，最终返回的 STAR 均通过两项原有事实保护。真实组合两个输入 hash
与历史记录一致；不因单条违规导致整份 Diagnosis 失败，原 content_filter 组合最终可用。
本轮 GLM-5.3 调用数为 0；历史单次 85.355 秒读取超时保留，GLM 不是最终模型。
Resume 保持 Ling3-flash，实现与配置均未修改；未改 `.env`，未增加 fallback。

### 回归与浏览器

- Diagnosis 定向：243 passed。Python 全量：576 passed、39 skipped、2 个依赖弃用 warning。
  跳过的可选集成测试不计作本轮通过，不以此声称重新完成 PostgreSQL 等全项目验收。
- frontend：77 passed、0 skipped。Ruff check 与 format --check：通过，109 个 Python 文件。
- 首次沙箱 pytest 临时目录权限错误，改为正常权限运行后通过；未更改测试断言绕过权限问题。
- 浏览器插件缺运行组件，使用本机独立 Edge/Playwright，实际产品页面、API、DiagnosisService，
  隔离内存数据库与明确合成输入。种子格式修正发生在模型调用前。
- 浏览器一次真实 DeepSeek 请求：上游 200/stop、8.661 s，产品 API 201、is_mock=false，
  展示 1 条 STAR；桌面 1440px 和手机 390px 无横向溢出，截图已检查，无页面脚本错误。
  Resume 模型调用 0。另一次离线 fixture 经真实服务过滤后 API 201，页面保留 1 条合法 STAR，
  隐藏 1 条数字违规条目，展示风险提示，无整页失败；该项不冒充真实模型过滤。
- 本轮总共 4 次真实模型调用（三组 + 浏览器），均无重试。浏览器截图仅为合成验收证据，
  guard 不构成对所有非数字语义的完整证明，既有人工事实核对要求继续保留。

### 结论

**Diagnosis 本轮修复和最终真实验收 PASS。** 最终 provider/model 为
`SiliconFlow / deepseek-ai/DeepSeek-V4-Flash`。可以进入整个 T5 项目的最终收尾与最终
门槛核对；这不代表本轮重新验收了所有模块或消除了既有独立质量评估限制。不合并 main。

本轮文件：Diagnosis `schema.py` / `public.py` / `README.md`，4 个 Diagnosis 测试文件，
`verify_diagnosis_migration.py`，本迁移记录、验收台账和本轮脱敏 JSON 证据。
