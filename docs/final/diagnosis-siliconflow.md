# Diagnosis SiliconFlow 迁移记录

2026-09-09，分支 `feat/core-a`，起点 `003050100023dc5c19c828bc28542fe4fcc9f599`。

## 当前结果

接入已验证；用户指定的 `deepseek-ai/DeepSeek-V4-Flash` 在原过滤输入上未通过事实校验，最终模型方案尚未验收通过。
用户要求停止继续针对 Ling3-flash 的 content_filter 调整 Prompt，改为单独迁移 Diagnosis。
本阶段未继续改 Prompt；保留同一任务此前的工作区改动。Resume 实现与配置未修改。

复用 custom + openai_chat，新增可选 `T5_DIAGNOSIS_JSON_MODE`：true 显式请求
JSON object；false 关闭；未设置保留旧行为。仅允许用于 openai_chat。
不新增 HTTP 客户端、SDK、依赖、模型默认值或自动 fallback。
详见 [模块配置](../../backend/modules/diagnosis/README.md#siliconflow-接入真实验收待完成)。

## 离线验证

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

## 真实验收：3 次调用后停止

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
