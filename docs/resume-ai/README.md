# Resume AI 结构化抽取

本轮将 Resume 默认主流程改为 AI-first。旧解析器依赖有限的章节标题与技能词表，无法稳定处理括号标题、自然姓名行及复杂技术项目；继续增加版式正则无法满足真实简历输入。当前 AI 只抽取事实，用户核对后才保存，不承担 STAR 或 JD 定向优化。

## 输入与公开契约

PDF 文本层、DOCX 正文/表格、UTF-8 TXT 先由原有安全适配器确定性提取文字，再调用独立 `ResumeAIService`。粘贴文本走同一条抽取路径。文件不永久保存，不新增 OCR、二进制模型输入或依赖。

模型只能返回 `name`、`education`、`skills`、`experience` 四个字段。name 未知为 null，education 未知为空字符串，数组未知为空数组；响应缺字段使用上述空值默认值；额外字段与错误类型拒绝。系统在校验后注入原始 `raw_text`，再通过现有 ResumeData 校验。公共保存、读取、匹配接口和数据模型不变。

`ResumeService` 默认使用 AI；旧 `OfflineResumeService` 仅供明确选择的离线基线测试，不是失败 fallback。测试浏览器 fixture 标记 `is_mock=true`，界面显示“演示识别结果”，不能当作真实 AI 成功。

## 事实约束

Prompt 明确只提取原文已有信息，不润色、不补充、不猜测；缺失信息留空。保留姓名、教育、技能、各段经历及日期数字，不将未完成或计划事项改成已完成事实，不添加建议。

默认发送 JSON Schema structured output；显式配置 `json_object` 时仍只接受严格 JSON。拒绝 Markdown 包装、重复 JSON 键、NaN、不完整响应、额外字段与错误类型，前端不消费原始模型字符串。

生产流程已删除事实守卫及其字符串匹配、技能拆分、计划关键词和数字/文本相似度规则。合法 JSON 经字段类型及 ResumeData 校验后直接返回核对草稿；技能漏抽、合并表达或语义质量问题由用户核对，不使整份解析失败，也不阻断手动保存。不新增替代规则或 warning 判定器。

流程：文件/文本 → 提取 raw_text → glm-5.2 结构化抽取（使用独立模型配置）→ Pydantic ResumeData 校验 → 用户核对 → 保存。strict JSON Schema 仍请求全部四字段；本地校验对省略字段提供空值，模型不得返回 raw_text。原始输入始终由服务端注入。

## 独立配置与错误处理

所有配置均为 `T5_RESUME_` 前缀，在 `.env.example` 有示例。Resume 不导入 Diagnosis 的 service、prompt、config、transport 或 retry。

| 配置 | 含义 |
| --- | --- |
| AI_ENABLED | 默认 true；关闭时明确报错，不进入规则解析 |
| LLM_VENDOR | 模型供应方标签 |
| LLM_MODEL / LLM_API_KEY / LLM_BASE_URL | 独立模型、凭据、HTTPS 服务地址；不可留示例值用于真实演示 |
| API_STYLE | chat_completions 或 responses |
| STRUCTURED_OUTPUT | 默认 json_schema，可显式改为 json_object；不自动降级 |
| LLM_TIMEOUT | 默认 30 秒，可配置至 120 秒；单次请求，无自动重试 |

客户端 Resume 请求独立等待最多 150 秒，覆盖服务端允许的 120 秒及上传/响应开销；其他模块的超时设置保持原样。普通网络中断仍可能无法收到服务端已提取的文字，这种情况下需重新上传或粘贴，不能承诺断网时跨端原文交付。

timeout、429、上游 5xx、401/403、配置、JSON、schema 错误返回固定友好信息，不输出密钥、完整地址、响应正文或简历日志。禁用重定向，响应大小限制 2 MiB。收到 AI 失败响应时，上传者获得已提取原文，界面显示失败并提供“重新识别”“手动填写”；重试提交现有原文，不重新上传。失败不写入简历记录，不覆盖确认字段或旧版本。

## 评测与验证

五份主评测输入及人工核对清单见 [样本说明](evaluation-fixtures.md) 和 [manifest](../../tests/resume/fixtures/ai-evaluation/manifest.json)：三份已有脱敏学生简历、用户提供的 Stefano 完整原文、一个标注为合成的中英混排样本。额外合成样本仅用于否定/计划边界。只向模型发送 raw_text，不发送来源 URL 等元数据。

用户原文按收到的换行和空格保存为 [stefano-user.txt](../../tests/resume/fixtures/stefano-user.txt)，2906 字符。其教育和成果是用户提供的表述，不代表本项目独立核实其真实性。

本次隐私受限验收使用 `tests/resume/accept_once.py`：先内存脱敏，默认仅预检；执行需明确授权，并以排他台账限制五份各一次。结果仅保留统计与必要短片段，不保存完整输入/模型输出。旧 `evaluate_ai.py` 的完整字段输出不用于本次授权。必须把候选内容质量与生产 Parser 是否成功分别记录。

实现基线 `0545b26` 已完成的验证（本次评测不改生产代码）：

- 全量 Python：489 passed，含本地真实 PostgreSQL/pgvector，无跳过；现有两条依赖弃用警告。
- Resume：原有 45 项 + AI 协议/守卫 46 项 + API 集成 21 项。文件安全用例全部保留。
- 前端全量：75 passed。
- Ruff check / format、`uv sync --locked` 通过，无依赖变更。
- PostgreSQL 冒烟通过：扩展、迁移、索引、读写、确认简历到真实关键词匹配。
- [三屏宽主链路报告](browser/offline-flow/browser-report.json)、[边界报告](browser/offline-boundaries/report.json)：1440、1280、390；显式离线 Resume/Diagnosis fixture，覆盖文件、字段保护、保存读取、匹配、优化页、错误重试及原有页面回归，不能作为 AI 质量证据。

测试隔离调整仅针对 Resume 依赖：旧解析用例显式选择 OfflineResumeService；原 Diagnosis 协议验收和 Jobs PostgreSQL 缓存测试的 Resume 前置步骤由公共测试 fixture 隔离，D 文件未修改。单元/集成测试默认禁止未注入的 Resume 网络调用，避免本地 `.env` 影响离线结果。`check_member resume` 默认只检查公开签名，真实调用需 `--live`；数据库冒烟使用确认字段。没有更改 CI 工作流、分支白名单或 D 业务实现。

用户已明确授权指定接收方/模型上的五份脱敏纯文本各一次，本次五次已执行完：**旧实现 0/5 被 Parser 接受，全部被事实守卫拒绝，真实质量验收未通过**。发现技能分组/复合表达误拒、“执行计划”误判为学习计划，以及项目技术遗漏。见 [实际评测记录](evaluation-results.md) 和 [统计](one-shot-results.json)。本轮新增脱敏预检回归 1 项通过，Ruff 通过；没有追加模型请求，未执行会增加调用次数的浏览器实时链路。本次授权已用完。

继续更新 PR #10（feat/ui-polish-a → feat/core-a），不自动合并，不修改 main 或 D 的 reliability 分支。


## PR #10 简化修订（2026-09-09）

按用户要求删除阻断式事实守卫，简化 Prompt 为原文抽取、禁止润色/补充/猜测、缺失留空。保留 strict structured output、JSON/schema 错误和 AI 请求错误处理、原文保真、核对与手动编辑。离线回归覆盖缺字段、多技能字符串、执行计划表达、预览不落库、核对后保存读取，以及前端进入成功核对状态。

本轮没有新增真实 AI 请求；历史五次评测结果保留，不能据此声称新实现已通过五份真实验收。一次性评测工具移除依赖已删除守卫的推测指标，仅保留对照锚点和人工核对提示。历史统计文件不改写。

本轮验证：完整 Python 离线回归 478 passed、39 skipped（本地未配置可选集成测试条件），前端 76 passed；Ruff check/format 与 diff 检查通过。未重新执行真实 AI 或浏览器实时调用。

## PR #10 合并后的补入分支

从 `origin/feat/core-a` 的 `2746ca4` 创建 `feat/resume-ai-simplify-a`，将遗漏提交 `1fb5be5` cherry-pick 为 `8a1b094`。生产流程保持 raw_text → LLM structured output → strict schema → 用户核对 → 保存，不增加事实 guard。

本基线重新验证：Resume 103 passed；Python 全量 532 passed、39 skipped（本地未配置可选集成条件）；前端 76 passed；`uv sync --locked`、全仓 Ruff check/format 和 diff 检查通过。两个既有依赖弃用警告。本次没有真实 AI 调用。

补入范围仅 Resume 实现、Resume 测试和对应文档；API 契约只修正 Resume 段落的缺字段说明。Diagnosis、Jobs、Analytics、CI 公共策略及 PR #9 最终验收记录不变。新 PR 指向 `feat/core-a`，不自动合并。
