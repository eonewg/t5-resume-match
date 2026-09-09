# Diagnosis reliability：固定样本的一次复验

2026-09-09；分支 `feat/diagnosis-reliability-d` 从准确基线
`ac79807846b2ec928aba0d77e439e8ff676d81b1` 新建，目标 `feat/core-a`。
本轮仅修改 Diagnosis transport/config/retry/observability、Diagnosis 测试与本记录。
未修改 frontend、公共 schema、Prompt、事实/数字 guard、Jobs/Matching、Resume、Analytics、
模型名、供应商、Mock/real 语义或失败 fallback。没有改写任何历史质量记录。

## 历史失败：已知与未知

原始证据：[operator-record](../../data/evaluation/star-supplement-2026-09-08/operator-record.json)、
[原报告](../final/star-supplement.md)。S1 为 93.133 秒，S2 为 94.140 秒，均三次内部尝试，
每次约 30–31 秒，最终 TemporaryLLMError。只有耗时、error/text、可空 token，没有 HTTP code、
异常类型或连接阶段。因此 **无法从既有证据进一步区分** connect/read timeout、HTTP 408/429/5xx
或网络错误；时间接近 30 秒不是底层故障证明。不能反推“上游一定超时”或“Prompt 太长”。

旧包装链：urllib/socket/HTTPException → `HTTPClient.complete`：HTTP 408/429/全部 5xx
包装为 TemporaryLLMError；TimeoutError/URLError/OSError/HTTPException 同样包装；`from None`
隐藏原异常链，消息不含 status/phase。HTTP 状态关闭响应后丢弃，URLError.reason 未分类。
随后 `DiagnosisService.diagnose_detail` 把 TemporaryLLMError 与 InvalidOutputError 放入同一
三次预算，sleep 1、2 秒；输出错误还会触发现有 repair 提示。最终 API 转为友好的模块失败。
原可观测 callback 未记录原因，故历史证据无法补回已丢失信息。

原统一 urllib `timeout=30` 是阻塞 socket 操作的超时，不是整个请求硬截止时间；DNS、多个
I/O 操作、持续缓慢响应均可能超出“3×30+1+2=93 秒”的估算。也没有有界排队等待或 Retry-After。
全部 5xx 重试包含 501 等明显不宜重放的错误，JSON/schema/事实拒绝也默认再付费调用。

## 新的时间与重试政策

环境变量前缀均为 `T5_DIAGNOSIS_`，字段均拒绝无限值与非法范围。

| 配置 | 默认 | 可配置上限 | 含义 |
| --- | --- | --- | --- |
| CONNECT_TIMEOUT_SECONDS | 5 s | 15 s | TCP/代理隧道/TLS 的 socket 连接超时；系统 DNS 阻塞由整次截止时间约束 |
| READ_TIMEOUT_SECONDS | 40 s | 90 s | 连接完成后发送有限请求体、等待响应头/读取响应的 socket I/O 超时 |
| TIMEOUT_SECONDS | 45 s | 90 s | 单次传输整体截止时间，含进程启动、DNS、连接、响应 |
| TOTAL_TIMEOUT_SECONDS | 95 s | 120 s | 整次诊断预算，包含同键排队、重试等待与传输 |
| MAX_ATTEMPTS | 2 | 5 | 初次调用也计入；所有类别共享该总次数上限 |
| BACKOFF_SECONDS | 1 s | 5 s | 第 i 次失败后 min(base×2^(i−1), 5) |
| RETRY_AFTER_CAP_SECONDS | 5 s | 10 s | 可接受的上游最小等待；更大时立即停止，绝不截短后提前请求 |
| OUTPUT_RETRIES | 0 | 1 | 单独、显式选择的 JSON/schema 修复预算，仍受总次数/时间限制 |

旧 TIMEOUT_SECONDS/MAX_ATTEMPTS 环境变量仍读取；显式的 30 秒/3 次仍有效，但整次 95 秒预算
仍生效。没有隐式换模型或供应商。复验显式固定新默认值，不修改本地密钥配置。

默认普通失败最多 `2×45+1=91` 秒；若有效 Retry-After 为 5 秒，最多 `2×45+5=95` 秒。
一般公式为 `min(total, N×request + Σ max(min(base×2^i,5), retry_after_cap))`，由
`settings.worst_case_seconds` 给出无排队时的保守上界；包含排队仍受 total 约束。
第二次实际预算会减去前面耗时和 backoff，不会重新获得整个总预算。
这是应用等待预算，非操作系统实时保证：进程终止回收、线程调度及有限本地 JSON 校验存在少量开销。
外部注入的任意 LLMClient/测试 opener 不受进程截止时间强制控制；正式三种 HTTP adapter 均受约束。

选择 40/45 秒是给当前非流式生成有限余量，并把默认三次减为两次，避免无收益的第三次等待；
不是声称 glm-5.2 的官方延迟 SLA。此前一次成功调用约 19.94 秒，本轮一次成功 29.657 秒，
另一样本仍两次超过 40 秒，证据不足以说明加时能可靠解决上游问题，不再继续提高上限求成功。

可重试：connect/read timeout、HTTP 408/429/500/502/503/504、连接重置/拒绝/中断、暂时 DNS
EAI_AGAIN、连接提前关闭/响应传输不完整。500 为服务器内部失败，有限重试；不把所有扩展 5xx
一概判为暂时故障。Retry-After 支持整数秒与 HTTP-date；非法值忽略，超预算直接停止。

不可自动重试：400/401/403/404 等请求/认证/配置错误、redirect、501/505/未确认的扩展 5xx、
证书错误、确定 DNS 名不存在、无结构原因的 URLError、永久 HTTP 协议错误、未知异常、
响应非法 JSON/缺字段/截断/过长、业务 JSON/schema/事实保护失败。无效 key 本地直接拒绝。
只有 operator 显式设 OUTPUT_RETRIES=1 时，业务 JSON/schema 格式可以使用原有 repair 消息
尝试一次：这是一项独立模型修复，不是网络重试；事实/数字拒绝与协议层错误永不走 repair。
默认关闭的理由是当前没有稳定收益证据，也不能将反复格式错误当成瞬时网络故障。

## 传输与内部可观测性

保持三个 adapter 的请求业务参数不变。stdlib urllib 的 socket inactivity timeout 不能覆盖
DNS 和逐字节慢响应，故每次真实请求使用一个可终止的短生命周期 Python worker。
无需新增依赖；父进程控制剩余预算，到期 kill/reap，不遗留本地传输 worker 或自动重试线程。
终止本地连接不保证供应商取消已收到的生成或费用；本轮没有自动重试以外的附加调用。
请求/密钥通过私有 stdin 管道传递，不进入命令行；worker stderr 不输出，上游错误正文不读取。
仍禁止 redirect，保留 512 KiB 请求/256 KiB 响应上限、TTL/LRU、同键合并；锁等待也有预算。
本地 HTTPS socket 的默认证书验证继续生效。部署环境需要允许启动同一个 Python 解释器。

分类：timeout、rate_limit、upstream_5xx、auth_error、request_error、connection_error、
invalid_output、unknown。另有安全 phase 区分 connect/read、整体截止、TLS、HTTP status、
response_protocol、response_json、response_envelope、output_truncated、output_json、
output_validation、fact_guard。不保留原始异常或敏感响应内容到错误字段。

Service INFO 事件 `diagnosis_attempt` 记录 vendor/model/attempt/error_category/http_status/
phase/elapsed_seconds/retry/backoff_seconds，以及服务返回的安全 token 数。HTTP callback 另记录
线级耗时，成功文本不等于业务有效，只有 Service status=validated 才代表 schema/guard 通过。
上下文由 ContextVar 隔离，请求结束即还原，不把 attempt/deadline 挂到共享 Provider。
日志不输出 Key/Authorization/endpoint/用户正文，外部错误仍为统一友好消息。

read 阶段表示连接已完成后的 I/O，不能判断供应商内部是在排队、推理还是生成；没有 HTTP 状态
时记录 null，不猜 504。worker 被截止终止时仅保留最后可观测阶段，不猜测未收到的响应。

## 唯一正式复验与证据

执行入口：[accept_reliability.py](../../tests/diagnosis/accept_reliability.py)。默认 pytest 不会调用它。
需 `--run-once`，证据文件以 exclusive create 打开；有旧文件即拒绝再运行，先记 started 再调用。
直接读取历史两例的完整固定输入，检查 input、endpoint、model/vendor/协议/max_tokens/Prompt 指纹。
首次预检在任何 API 调用前因 CRLF/LF 字节哈希差异停止；核对历史与当前 Git Prompt 内容完全相同，
同时记录两种换行哈希后才开始唯一实际调用轮次。Prompt 内容未改。

| 案例 | 结果 | 内部尝试 | 每次耗时 | 等待 | 总耗时 | HTTP / tokens |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | TemporaryLLMError，timeout/read | 2 | 40.516 / 40.437 s | 1 s | 81.953 s | null / 未返回 |
| S2 | validated，非 Mock | 1 | 29.657 s | 0 | 29.657 s | 200 / 输入 2300、输出 2005 |

S1 失败后停止，没有第三次或外层重跑，没有可评价的 STAR。新的 read 分类是本轮证据，不能倒推
历史两次失败也是同一原因。S2 返回 2 条 STAR，原文引用/数字保护通过，已有 93.1%、234KB、
1820.78ms、489.18ms、3.7x 等保留；岗位建议覆盖原 JD 要求，未把待补技能写成已有事实。
Agent 审閱未发现 STAR 新增公司、掌握技能或成果；这不是人工质量评分或总体正确率。
保留一项措辞问题：风险文字把“未描述 Linux/Ubuntu”称为“与 JD 核心要求不符”，信息缺失不能
证明不具备能力；本轮仅记录，不改 Prompt。输入只是完整项目段落，也不代表整份简历缺少学历。

- [不可覆写的运行证据](../../tests/diagnosis/evidence/reliability-fix-2026-09-09.json)
- [独立于原历史质量记录的 Agent 复核](../../tests/diagnosis/evidence/reliability-review-2026-09-09.json)

运行时记录所有 Diagnosis 源码哈希。复验后离线审查补齐一个可观测性边界：若已经收到 HTTP
响应头而在读取正文时超时或触发截止时间，保留已知 HTTP status；专门离线断言验证，不追加
真实模型调用。timeout/retry/Prompt/请求参数不再变化。全部原 data/evaluation 文件哈希保持不变。没有“刷 PASS”，没有把历史失败改写成“已解决”。

## 自动化验证和 A 的最小集成事项

- Diagnosis：203 passed（原 149 项 + 新 54 项）；原测试仅更新明确改变的默认时间/重试分类，
  保留所有旧场景；原格式修复场景改为显式 OUTPUT_RETRIES=1，而非删除测试。
- 全量 Python（真实 PostgreSQL/pgvector 环境）：450 passed，最终回归 114.31 s，无 skip。
- Ruff check、format check：通过；94 Python 文件。
- check_member diagnosis、jobs：均通过（含公共测试）。
- `git diff --check` 通过；frontend、Prompt、schema 相对 ac79807 无差异。
- 本地 D scope 按实际变更检查；远端 CI 分支白名单尚未包含本次用户指定的新分支：
  `check_scope --ci` 明确失败，而非代码测试失败。**请 A 将 feat/diagnosis-reliability-d 加入
  scripts/member_specs.py 的 D_BRANCHES，并按需加入 workflow push 分支列表。**
  本轮没有越界修改公共 scripts/CI，也不使用其他分支名绕过检查。

PR 目标仍为 feat/core-a；提交前 fetch 时 A 基线仍 ac79807，A 的 UI polish 独立分支已前进，
本轮不合并或覆盖其 frontend。后续由 A 审核 CI 分支接入及部署是否允许 worker 进程。
