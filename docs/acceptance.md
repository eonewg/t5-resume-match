# T5 模块验收台账

## 当前状态

验收单位固定为 Resume、Jobs/Matching、Diagnosis、Analytics；A 负责统一验收。当前代码存在于 feat/core-a，D 业务分支按 feat/*-d 命名（feat/intelligence-d、feat/ui-refresh-d 等），A 专项分支按 feat/*-a 命名，均只向 A 提 PR。

| 模块 | Owner | 当前实现 | 验收状态与待办 |
| --- | --- | --- | --- |
| Resume | A | 保守解析、受保护结构化编辑、确认保存/重读、历史版本及原文保留 | 功能 PASS；PR #8 与 fresh install 复验通过，自动解析仍需用户核对，独立 AI 评估有漏项 |
| Jobs / Matching | D | PR #6 已集成；关键词基线、tools/薪资解析、可选语义增强及事务片段缓存 | 本阶段 PASS；semantic 默认 off，独立 AI 盲评 / LLM-as-a-Judge 已返回并汇总，不作为人工金标准 |
| Diagnosis | D | PR #7 三协议适配已集成，custom/openai_chat 真实调用通过 | 功能/集成 PASS；固定评估不变，补充两组完整经历均请求失败；效果不可评价，保留真实模型限制 |
| Analytics | A | 真实统计、来源/日期筛选、词云/技能分布、分币种/周期薪资图与五份真实快照 | 本阶段 PASS；两批合计 10 条/6 雇主，4 条 USD 年薪可比较、5 无区间、1 周期未知；独立 AI 评价已汇总，PR #8 与 fresh install 技术复核通过 |

当前自动化检查见 [验证记录](validation.md)。功能目标与当前实现分别记录，不能把已接入、Mock 或测试通过等同于完整 T5 验收。

## 最终系统门槛

所有项目均需准确提交、命令/步骤、实际结果和证据位置；未执行写“待验证”，不预填 PASS。

| 门槛 | Owner | 当前差距 / 所需证据 |
| --- | --- | --- |
| 问题定义 | A 汇总、D 分析 | 至少 2 款招聘 APP 对比、5 份真实 JD、3 份学生简历，脱敏、来源与表达/技能 gap；PASS（材料范围）：5 JD/3 履历及痛点报告已有；2026-09-09 用户提供两款人工体验，已归档流程、优缺点与设计对照 |
| Level 1 resume | A | 本阶段 PASS：原文粘贴→解析→结构化编辑→保存→重新读取；保护用户确认值，缺失字段留空 |
| Level 1 jobs/matching | D，A 提供持久化 | JD 输入保存复用、技能/工具提取、关键词基线、0–100 分数、matched/missing/gap 及一致解释；只有向量评分不通过 |
| Level 2 | D，A 串联 | 平淡经历 STAR、JD 定向关键词/经历建议、量化补充提示、不虚构事实；真实/Mock 与失败行为区分；真实 custom/openai_chat 已验证；固定评估输出质量仍待复核 |
| Level 3 | A，D 解析 JD | 本阶段 PASS：词云/技能分布、分组薪资图、观察与来源口径；真实来源十条与薪资证据已补齐，PR #8/fresh install 图表复验通过，口径见 final/delivery-status.md |
| PostgreSQL + pgvector | A，D 提供参数 | 公共设施及 PR #6 事务片段缓存已真实复验 PASS；独立空库迁移与 clean clone 启动复现 PASS，见 final/fresh-install.md |
| NLP 与向量 | D | 固定 MiniLM revision、384 维 cosine 与关键词组合已集成；默认 off，质量金标准与独立效果评估待完成 |
| 全链路演示与 E2E | A/D | 五页十步浏览器主流程、原文/建议与全部图表 PASS；模型首次临时失败、显式重试成功，失败已记录 |
| 可复现运行 | A | PASS：合并 a41a31d 的独立 GitHub clone、新 venv/空依赖缓存、新数据库迁移、正式启动与刷新/重启持久化；见 final/fresh-install.md |
| AI 过程与设计材料 | A/D | 真实需求拆解、架构/Schema/API、编码、测试审查、文档/演示复盘；原型工具采用情况如实说明 |
| 最终合并 | A | 四模块完整 PASS、全部集成、完整测试通过且 A 已 push；仅 feat/core-a → main PR，合并后复核启动/核心链路 |


## 验收与集成记录规范

每条记录必须包含日期、模块、owner、准确源 SHA、A 基线、变更范围、越界/误提交检查、契约检查、测试步骤与结果、未验证项、结论和下一步。集成后补充集成 SHA 与回归证据。

- PASS：准确提交在明确验收范围内通过，可集成。
- BLOCKED：存在必须修复的业务或越界问题，列出文件、复现与预期。
- ADAPT：需要 A 公共适配，复验 PASS 后才能集成。
- 待实现/待验收：尚无完整交付或未执行验收，不预填结论。

A 自有模块执行相同门槛；新增提交重新检查，集成失败保留证据并停止后续合并。最终只通过 feat/core-a → main PR 交付。

## 2026-09-08：A Resume / Analytics 产品阶段

- A 基线 `ee983782ef7c8af411869b52a55422267be54b96`，包含已验收 PR #6 merge `79e35a9de94245c466e9218ef132643d92c1eb0a`。本条记录随本阶段功能提交，最终源 SHA 可由该提交取得；不合 main，不集成 D 新分支。
- 范围：A Resume/Analytics、公共 API/schema/services/config、来源迁移 5、前端普通导航与编辑入口、A 测试和共享文档。D Jobs/Embedding/Diagnosis 业务文件与测试无改动，公共旧 parse/match/diagnosis 协议兼容。
- Resume：字段编辑/清空和确认均受保护，重解析建议逐项显式采用；保存后 GET 全字段比较，读取失败只重试 GET。student-03 从空 skills/experience 修复为原文支持的 Python 与 10 段经历；不推断未出现技能。
- Analytics：五份真实 Canonical 快照，单雇主，频率按包含技能的岗位数统计。全部未知薪资，保留缺失统计，不填零。不同币种/周期独立分组；合成薪资图形验证与真实样本分离。详见 [报告](analytics-sample-analysis.md)。
- 结果：真实 PostgreSQL 下 Python **264 passed、0 skipped**；frontend **53 passed**；锁定依赖、Ruff check/format、PG/pgvector smoke 通过。独立无头 Edge 完成编辑器→JD→Match、重解析保护、保存重读/刷新、移动端和 Analytics 验证，见 [验证记录](validation.md)。
- 结论：Resume / Analytics **PASS（本阶段范围）**。最终缺口仍包括 D Diagnosis 新 PR 与真实输出/延迟/事实边界验收、人工效果评估、竞品/痛点报告、完整十步演示与最终 fresh install；真实薪资和更多雇主样本需补充。不得据此标记全系统最终 PASS。

## 2026-09-08：PR #5 Level 1 正式集成与公共基础设施

- D 源：`fe3dfbb65ec5fe46852a6fb9ddd0a42adf2c92f5`；继承 A 基线 `844b89c`。本次先验证用户确认的未提交 Resume 基线并提交 `c4ef397`，然后合并 PR #5 为 `ebbe251`，目标仅 feat/core-a。
- PR diff 为 D jobs/diagnosis 文档、Jobs 模块与前端/测试，未越界修改 A 公共层；旧阻塞文档已对齐、PR 已脱离 draft 且可合并。准确源提交独立 worktree：Python 104 passed、前端 32 passed；GitHub 检查 8 项 SUCCESS。
- A 适配：默认 Jobs provider/正式注册，HTTP JDCreate 与兼容 JDData 字段、旧 JSON 迁移；D 旧 parse port 和关键词算法不变。D 测试仅增加显式 Mock Resume 配置以保留既有来源传播断言。
- 数据库：原生 Windows PostgreSQL 17.6 + pgvector 0.8.1 已启动连接、建扩展/表与索引、读写查询、迁移/约束/回滚通过；未选定或实现生产 embedding 模型。
- 独立材料：5 新真实 JD + 3 公开学生时期简历；不是 D 已有调词表样本，不伪造学生经历。历史/语言/单雇主限制见 [材料说明](../data/holdout/2026-09-08/README.md)。
- 本地验证：全量 Python（含 PG）142 passed、前端 33 passed、Diagnosis 44 项离线回归、PostgreSQL/pgvector 与 Resume → JD → keyword match smoke 通过。无头 Edge 默认导航、编辑后确认简历 API、33.33%/gap、502 重试、390px、重复导航选择保留通过。
- 结论：**PASS（本阶段范围）**。不代表完整 T5 PASS：Resume 编辑器 UI、Analytics、D tools/薪资解析、Embedding 与真实 AI 质量仍待后续。
- 给 D 的当前公共契约见 [A 交接](integration_requests/A-level1-vector-handoff.md)，详细验证见 [验证记录](validation.md)。

## 2026-09-08：PR #6 最终缓存集成复验

- A 基线：`adfcc33e3854ef7cfddab8e1f59c93d8d66db05a`；D 源：`fd6cf30813d9af86f1da55b933dafb5219b51bfd`。
- 本轮开始查询时 PR 已于 07:47:39 UTC 合并，merge commit 为 `79e35a9de94245c466e9218ef132643d92c1eb0a`，双亲准确对应以上 base/head；本地与远端 feat/core-a 一致。本轮在此合并提交复验，没有重复合并或操作 main。
- 审查 34 个变更文件：仅 D Jobs 后端、前端、测试及 D 集成记录。D 仅在 match_with_context 的公共仓储作用域内注册/读写片段，没有直接 SQL、Session、向量表访问或 commit/rollback。保存点异常在作用域外捕获，外层请求仍拥有事务。
- 关键词基线保持结构化字段、归一去重和等权覆盖率；语义只调整 score/解释，不改变 matched/missing。tools 不重复计数；HTTP 显式字段含空数组/null 仍覆盖解析。薪资仅解析明确表达，不猜币种/周期、不跨周期换算。
- semantic 默认 off。每文档最多完整处理 512 片段、每批 16 条、编码前检查 128 token；超限明确降级，不静默截断。hash 覆盖实际有序输入，空间隔离模型/revision/预处理。
- 真实 PostgreSQL 17.6 + pgvector 0.8.1：全量 Python **247 passed、0 skipped**；前端 **33 passed**；PG smoke、锁定依赖、Ruff check/format（78 文件）通过。两条既有依赖弃用提示保留。
- 数据库回归覆盖 Resume preview→保存→JD→Vector cache→Matching/读取、miss/hit、两类文档 hash 失效、版本隔离、SQL 失败保存点回滚后内存降级、模型失败关键词降级、workflow 失败撤销缓存与 MatchRecord。
- 固定真实 MiniLM 的 5 JD × 3 简历复验通过：10 个语义配对 miss/hit 一致且 hit 不编码，内存与 PG 最终分相同；5 个 student-03 配对为明确 empty 降级。完整片段数量与 D 报告一致，没有把解析遗漏当作成功向量匹配。步骤见 [验证记录](validation.md#2026-09-08pr-6-合并提交复验)。
- 结论：**PASS（PR #6 集成范围）**，无实际 blocker。本轮未重跑浏览器 smoke，已有 D 浏览器结果仍为 D 提交证据；未调用真实 Diagnosis AI，未完成 T5 全系统验收。
- 下一阶段：A 优先完成 Resume 结构化编辑器与解析遗漏处理，随后实现 Analytics 三类图表及来源/时间/样本量/缺失值口径；D 优先真实 Diagnosis STAR/JD 定向建议、量化提示、事实边界、失败与延迟验收，并维护 Jobs 回归。A/D 联合补人工效果标注、招聘 APP 实际体验、十步演示与最终 fresh install；语义保持默认 off，最终仅经 feat/core-a → main PR 交付。

## 历史审查（已由以上准确新提交复验取代）

### PR #5 · 旧 D 文档交接 — 当时 BLOCKED

- 源提交：dd1933e02642172d4ddbf2c3cf0ac61a9b0e978b；A 基线：124466058255a4094615a7ea84d0a47a5082b1eb。
- 范围：6 个 Markdown 文件，位于 Diagnosis README 和 D 集成请求目录；无业务代码、公共 Schema、依赖或 CI 修改。未检出常见密钥/私钥格式。
- 当前 PR 为 draft，GitHub 显示冲突；检查结果为 1 项 FAILURE、3 项 CANCELLED，不能记为通过。
- 必须修复：同步最新 A 基线并解决文档冲突；D-agent-policy、D-two-person-allocation 与 D-strict-plan 含失效职责/流程叙述和过期命令，须改为当前 A/D 约定；共享需求/分工应引用根规范，避免复制后产生不同版本。
- D-strict-plan 将 owner 映射、双模块自检、分支触发和公共说明列为未完成，但当前 A 已具备这些能力。应只保留仍需处理的 JD 字段、向量参数、超时预算和样本等请求。
- Diagnosis README 的新增计划链接相对路径多了一层父目录，需要修复。
- 该 PR 仅文档交付，不代表 Jobs/Matching 或 Embedding 实现；本次未运行不存在的模块测试，也未合并。D 更新准确提交并重跑适用检查后复验。

## 2026-09-08：PR #7 集成与最终交付准备

- A 本轮基线 `0b175f0b73071b648012f32257e51cdaf9524c78`，已合入 D PR #7，D 源 `35b1301c9389b7a68dbbaefe28292870113d645d`。本次源 SHA 为包含此记录的提交，可用 git log -1 -- docs/final/delivery-status.md 定位。
- PR #7 scope/契约及 10 项 GitHub 检查通过；A 公共适配为确认字段送入 Diagnosis 和诊断专用超时，不改 D 算法。准确源 Python 378 passed、前端 54 passed；真实请求与浏览器证据见 [测试整理](final/test-results.md)。
- 本次提交新增五份真实招聘方摘要与薪资证据、幂等导入、固定评估材料与原件保护汇总程序、架构/痛点/竞品阻塞/演示/限制记录；前端、backend、公共 API 和数据库实现未修改。
- UI 权限：仅 `feat/ui-refresh-d` 获得 frontend 全目录和明确设计文档权限，旧 D 两业务分支权限不变；禁止 UI 分支修改 backend、算法、数据库、API 文档或 CI。PR 只指向 A；member 门槛继续四模块契约，CI 继续全量测试。
- 本轮全量真实 PostgreSQL 测试 **396 passed、0 skipped**（27.98 秒），前端 **54 passed**；PG/pgvector smoke 和 Ruff 通过。空 STAR 汇总修正后两项非数据库回归再次通过，PG 样本测试此前全量通过。两条现有依赖弃用提示不隐藏。
- 评估状态：独立 AI 盲评 / LLM-as-a-Judge 已返回，不是人工盲评；reviewer-ai.json 已返回并原样保存，汇总见 final/ai-evaluation-results.md。真实三组调用中 2 响应成功但 STAR 为空、1 失败；D1/D2 输入仅首条标题/时间，不能概括整段项目诊断质量。保持原材料与失败，不重跑挑选结果。
- 竞品：两款产品登录后体验未完成，原因与实际访问结果已记录，不阻塞材料提交。fresh install 按用户指示延后至 D UI PR 集成后。
- 结论：本轮集成准备与权限回归 PASS；最终系统仍待 UI、评估复核、竞品证据和最终安装/E2E。等待 D UI PR，不合 main。


## 2026-09-08：PR #8 最终 UI 集成与 fresh install

- A 基线 `41ab5ce8d4a23544a79e601bcacd6aa10d1369b9`，D head `828dc948767e64d28c2b6dc9450bd11162331910`；A 脚本适配/审查提交 `5a50ca408cdf721e073564c0094ccd22a7d29a24`。PR #8 merge **a41a31d22dac3b31cb7cac8303f63cdd799ecab4**，只合入 feat/core-a，未合 main。
- Review **PASS（UI 范围）**：17 文件符合权限；五页真实流程、保护/重解析/保存重读、后端真实分数及状态、诊断失败/重试/事实提醒、市场来源/样本/未知薪资、固定文案及 Desktop/390px 已检查。模型输出原文不因术语清理被改写。详见 [审查](final/pr8-review.md)。
- A 旧 live 脚本只适配定位/折叠入口/文案，业务断言保持。准确 D head：Python 396 passed、frontend 57 passed，真实 PG/pgvector 与 scope 通过；GitHub 10 项 SUCCESS。真实浏览器 53.155 秒成功。
- 合并提交 GitHub CI SUCCESS。干净安装创建新 venv/空下载缓存、新空数据库；Python 396 passed、0 skipped（23.32 秒）、frontend 57 passed、Ruff、PG/pgvector、四模块契约与 scope 通过。真实链路首次 TemporaryLLMError/502，保留失败；第二次 53.757 秒成功，未降级为 Mock。18 条记录重启前后逐项一致；刷新/390px 读取、桌面/移动五页及演示/失败回归通过。见 [安装记录](final/fresh-install.md)。
- 本次收尾更新 README、验收台账、AI 评估结论、竞品/痛点报告、演示脚本、测试与限制记录。评审原件 hash 不变；原三次模型评估不重跑、不覆盖。
- **技术交付 PASS；完整课程/质量验收尚不具备全 PASS 条件**：固定质量评估没有非空 STAR 可评样本，解析漏项及匹配效果只能作为有限证据；两款竞品登录后核心体验未完成。故不创建宣称验收通过的 feat/core-a → main PR，不合 main。待补齐这些证据后再准备最终 PR。


## 2026-09-08：补充 STAR 验证与公开竞品调研收尾

- 基线 ac952ff63e37214392f66fb42fe4446026556c81；仅文档与新增评估材料，不改 backend、Diagnosis、Prompt、UI、配置或依赖。原固定评估四文件调用前后 SHA-256 一致，原结果/评分不覆盖。
- 补充 STAR：事先固定 S1 网页/MySQL、S2 算子性能两组完整原文项目及相关归档 JD；使用原配置各一次外层请求，均三次内部尝试后 TemporaryLLMError（93.133 / 94.140 秒）。无可用输出，不能称成功返回空 STAR；忠实度/事实数字/JD针对性/可用性均无法评分。独立 AI Agent 核验证据，不代填人工或质量分。按用户指示记录限制，不再重跑或修改 Prompt。见 [报告](final/star-supplement.md)。
- 用户明确本次竞品材料为公开资料/反馈摘要；A 补核官方说明，完成流程/长处/问题主题/差异/已采用与未采用设计对照。没有登录人工体验，未附源链接的反馈不作已证实缺陷。见 [竞品报告](competitor-analysis.md)。严格课程体验项仍待实际记录。
- 本轮不重复完整 fresh install，既有 a41a31d 产品实现与依赖不变。检查新增评估程序、JSON、源文/Prompt/旧评估哈希和文档链接；提交后由既有 CI 确认完整回归。
- 补充操作与文档收尾完成；按用户要求创建 A → main **草稿 PR**，披露模型/质量限制与人工体验待补，不声称全部门槛 PASS，不自动合 main。


## 2026-09-09：两款人工竞品体验归档

- A 基线 91cc174b9959f4412833354c22afe7e4a7b62e43。用户提供当日 BOSS直聘和已登录智联网页版体验记录，覆盖在线简历、诊断/AI 优化、岗位推荐/匹配和结果展示；已归档原文及优缺点、T5 差异与实际采用/未采用设计。
- 结论：**竞品体验证据缺口关闭（用户书面实测记录范围）**。导入/上传/导出/下载是记录中的功能观察，不额外声称已逐一执行文件往返、投递或沟通。“未明显展示”限定于体验路径，不推断产品没有该能力。无需为归档再次要求截图或改系统。
- 本次仅更新文档与 PR #9 描述。产品、Diagnosis、Prompt、UI、模型配置、原固定和补充评估均未修改；不重复 fresh install 或付费调用。执行文档链接/diff 与数据未变检查，提交后 CI 验证。
- PR #9 保留草稿，供用户最终审查，不自动合 main。STAR 补充两次请求失败、无可评价输出继续作为已知效果/可用性限制，不因竞品记录到位而改写成质量 PASS。

## 2026-09-09：Diagnosis SiliconFlow 迁移验证

- 基线 `003050100023dc5c19c828bc28542fe4fcc9f599`，仅在 A 分支工作。复用 custom/OpenAI Chat，增加显式 JSON mode 配置；未改 Resume 实现或配置，未增加 fallback。
- 用户指定 `deepseek-ai/DeepSeek-V4-Flash` 并授权将配置与 Key 保存到未跟踪 `.env`。3 次真实调用均 HTTP 200/stop：最小 JSON smoke 通过，极简业务 schema/STAR/数字保护通过，原 Ling content_filter 输入在新模型上被本地 fact_guard 拒绝。
- **Diagnosis 真实模型验收未通过**。此轮没有再出现上游过滤，但没有有效业务诊断；按用户停止条件未执行另一正常组合或真实浏览器调用，等待用户指定下一模型，不自动重试或挑选模型。
- Python 全量 562 passed/39 skipped，frontend 77 passed，Ruff check/format 通过；可选跳过项不记为通过。模型实际结果及同一任务此前的 Ling 排查、离线界面恢复证据见 [迁移记录](final/diagnosis-siliconflow.md)。不改写旧评估、不合 main。
