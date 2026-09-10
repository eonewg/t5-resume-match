# 公共 API 契约 v1

前缀 `/api/v1`，默认 JSON 请求/响应；文件上传使用 multipart/form-data。动态 OpenAPI 为 `/openapi.json`，交互文档 `/docs`。契约模型在 `backend/schemas/contracts.py`，未知输入字段拒绝。验证错误不回显输入；文件提取成功后的 AI 失败会把原文返回给本次上传者，以便重试和手动填写，见下文。

## 路由

| 方法与路径 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /` | 无 | 公共工作台 HTML，替代原来跳转 `/docs` 的行为 |
| `GET /assets/{path}` | 无 | Vite 构建的前端静态资源，仅限 frontend/dist/assets |
| `GET /demo/sample.json` | 无 | 明确标注的合成样例 JSON，与成员自检共用 |
| `GET /health` | 无 | 200，数据库连接正常 |
| `GET /ready` | 无 | 200 全部配置真实入口；503 尚有 Mock |
| `GET /api/v1/modules` | 无 | 四个入口的 `is_mock` |
| `POST /api/v1/resumes/parse` | `{"raw_text":"简历原文"}` | 201，Resume |
| `POST /api/v1/resumes/preview` | `{"raw_text":"简历原文"}` | 200，ResumeData 草稿；不写库 |
| `POST /api/v1/resumes/upload-preview` | multipart/form-data，`file` 文件字段 | 200，ResumeData 草稿，含提取的 raw_text；不写库 |
| `POST /api/v1/resumes` | ResumeData | 201，保存结构化简历，Resume |
| `GET /api/v1/resumes` | `limit=20&offset=0&order=asc` | Resume 数组；可用 order=desc 读最新记录 |
| `GET /api/v1/resumes/{id}` | 无 | Resume |
| `DELETE /api/v1/resumes/{id}` | 无 | 200，`{"deleted_count":1}`；不存在返回 404 |
| `DELETE /api/v1/resumes` | 无 | 200，`{"deleted_count":N}`；清空全部历史简历，空库为 0 |
| `POST /api/v1/jobs` | JDCreate（兼容原 JDInput 请求） | 201，JD |
| `GET /api/v1/jobs` | `limit=20&offset=0` | JD 数组 |
| `GET /api/v1/jobs/{id}` | 无 | JD |
| `POST /api/v1/matches` | PairInput | 201，MatchRecord |
| `GET /api/v1/matches/{id}` | 无 | MatchRecord |
| `POST /api/v1/diagnoses` | PairInput | 201，DiagnosisRecord |
| `GET /api/v1/diagnoses/{id}` | 无 | DiagnosisRecord |
| `POST /api/v1/workflow` | PairInput | 201，`{"match": MatchRecord, "diagnosis": DiagnosisRecord}` |
| `GET /api/v1/analytics` | 可选 source_type、date_from、date_to | AnalysisResponse，基于筛选后的已录入 JD |
| `POST /api/v1/analytics/sample-jobs` | 无 | 200，`{created, existing, jd_ids}`；主动导入 5 份固定真实快照 |

列表 limit 1–100，offset ≥ 0，按创建时间、ID 升序。当前为小型课程数据集，analytics 公共层读取全部 JD 后统一筛选，再传入 provider；扩大数据量前需增加数据库筛选/聚合。普通创建 POST 非幂等，每次创建新记录；固定 sample-jobs 导入按来源/采集日期/原文去重，使用确定性 ID 与事务，不覆盖已有快照。

## 数据结构

ResumeData：

```json
{"name":"示例","education":"本科","skills":["Python","SQL"],"experience":["数据分析项目"],"raw_text":"完整简历文本"}
```

`raw_text` 必填且逐字保留（含首尾空白和换行），纯空白拒绝；其余字段有默认值，未知 name 为 null。Resume 在其上增加服务端 `id=resume_<uuid>`。结构化保存不进行技能推断。preview 用于编辑前草稿，POST /resumes 保存确认后的新版本；不覆盖历史记录。

删除简历在同一数据库事务内删除对应 MatchRecord、DiagnosisRecord 与简历本身；PostgreSQL 的 document_vectors、fragment_vectors 使用现有外键级联删除对应简历向量。任何步骤失败整体回滚；JD、JD 向量和其他简历不受单条删除影响。全部清空不受列表分页限制，清除请求选中的全部历史简历及其关联记录，保留岗位库。删除后对应记录 GET 返回 404；客户端应同步清除已删除的当前简历选择和关联匹配/诊断结果。

文件预览仅增加输入适配：提取文本后复用相同 provider、ResumeData 和 `X-T5-Mock` 响应头。不会直接覆盖已确认字段或创建记录；用户核对后仍通过 `POST /resumes` 保存。提取的全文逐字进入 parser 并作为 raw_text 返回，不承诺恢复 PDF 的原始排版。

- TXT：`.txt` + `text/plain`，UTF-8（去除开头 BOM），保留其余空白/换行；解码失败明确提示改用 UTF-8。
- DOCX：`.docx` + `application/vnd.openxmlformats-officedocument.wordprocessingml.document`，读取正文段落及表格单元格内段落，按文档顺序换行连接；不执行嵌入内容、不读取外链，拒绝宏和 XML 实体。ZIP 总展开上限 30 MiB、最多 2000 个成员。
- PDF：`.pdf` + `application/pdf`，仅文本层，无 OCR。加密 PDF 拒绝；最多 100 页，各解压流及累计页面内容限制 30 MiB。提取后少于 10 个文字/数字字符时返回：**未能从该 PDF 提取有效文字。扫描版简历暂不支持，请上传可复制文字的 PDF，或直接粘贴简历文本。**

上传默认上限 10 MiB，可通过进程环境变量 `T5_RESUME_UPLOAD_MAX_BYTES` 设置正整数字节数；提取文本仍遵守现有 50000 字符上限。文件名不参与路径构造，不持久保存原始文件；框架临时上传文件在处理完成后关闭。错误沿用公共错误结构：415 后缀/MIME 不支持，413 文件过大，422 空文件/损坏/无文字/文字过长，503 上传大小配置无效。错误不包含文件名、服务端路径或解析器异常栈。

Resume 默认 `ResumeService` 已改为 AI-first：上传提取后的纯文本和粘贴原文都调用独立 AI 抽取器。模型仅输出 name、education、skills、experience 四个字段；官方 DeepSeek JSON Output 配合 Prompt 请求完整字段，未知信息留空。本地校验允许缺字段并填入空值；拒绝额外字段、非 JSON、重复键和类型错误。JSON/字段结构校验后（缺字段默认留空），系统组装原始 raw_text 为 ResumeData。模型不得生成 raw_text，失败不退回规则解析。旧 `OfflineResumeService` 仅保留为显式离线测试基线。

Resume 编辑器首次识别仅填充未保护字段；用户手动修改或确认的字段（包括空值/空数组）不再被重识别自动替换。主动逐项“采用建议”可以替换对应字段。保存后 GET 比较全部字段，验证一致才更新共享 resumeId；读取失败只重试读取已保存 ID，不重复 POST。AI 成功、失败、演示结果分别显示；失败支持重新识别和手动填写。

AI 错误沿用公共包装，例如 `{"error":{"code":"504","message":{"code":"timeout","message":"AI 简历识别超时，请重试或手动填写。"}}}`。上传已提取文字时，该 message 对象另含 `raw_text` 原文；只返回给本次上传客户端，不写入记录或日志。粘贴请求失败保留前端现有原文。配置未完成/关闭返回 503，限流返回 503，超时返回 504，上游/认证/JSON/schema 失败返回 502；不返回 key、endpoint、上游响应或内部异常。每次操作只有一次模型请求，重试由用户明确触发。

独立配置及质量验证见 [Resume AI 抽取说明](resume-ai/README.md)。公共 ResumeData 和保存/读取契约不变。

JDInput 是 D 的旧 parse port，保持 title/company/jd_text 三字段；HTTP JDCreate 与返回的 JDData/JD 增加可选字段：

```json
{"title":"数据分析师","company":"示例公司","jd_text":"需要 Python 和 SQL","skills":["Python","SQL"],"tools":["Python","SQL"],"salary":"15–20 EUR / hour","salary_min":15,"salary_max":20,"currency":"EUR","salary_period":"hour"}
```

`company` 可省略；JD 再增加 `id=jd_<uuid>`。只传原三字段仍有效。

| 字段 | 默认与语义 |
| --- | --- |
| `skills` | `[]`；维持 v1 的技能/工具关键词并集，当前 D 的关键词匹配仅消费此字段 |
| `tools` | `[]`；独立工具标签，不自动参与额外计数；不能只填 tools 就期待旧算法使用它 |
| `salary` | `null`；薪资原文，最大 2000 字符，完整保留首尾空白 |
| `salary_min / salary_max` | `null`；非负有限数值，二者都存在时 min ≤ max；以 currency/period 对应的实际金额为单位，不默认是 K/月 |
| `currency` | `null`；已确认币种标签，如 CNY、USD、EUR，不推断币种 |
| `salary_period` | `null`；已确认周期标签，如 hour、day、month、year，不做跨周期换算 |
| `source_type` | `unknown`；real / course / synthetic / unknown，分别为真实采样、课程样本、合成演示、来源未确认 |
| `source_url` | `null`；最多 2000 字符的 HTTP(S) 来源链接，拒绝凭据型 URL；不由服务自动抓取 |
| `source_name` | `null`；可选来源名称，最多 200 字符 |
| `collected_at` | `null`；ISO 日期 YYYY-MM-DD，表示资料采集日期，不代表职位发布日期 |

HTTP 层只向旧 provider 传 JDInput；provider 可返回完整 JDData。客户端显式给出的确认字段覆盖解析结果（包括 skills=[]、salary=null），省略的字段保留 provider 结果。
真实 Jobs 的 tools 输出采用 D 已有工具标签规则，`Python SQL Docker` 返回 `["Docker", "Python", "SQL"]`。PR #6 已集成保守薪资解析与可选语义缓存；仅解析明确薪资表达，不猜测币种/周期。A 不另写关键词算法。
所有可选字段写入 jobs.payload JSON，列表/按 ID 读取完整返回；旧 JSON 缺失字段按默认值兼容。migration 2 补技能/薪资，migration 5 补来源默认字段，保留已有值、ID、时间和 Mock 来源。source_type=real 必须同时提供 source_url 和 collected_at；该标签表示录入方提供了可追溯资料，不等于平台独立核验，也不表示岗位现在仍开放。旧记录不自动推断为 real。

PairInput：

```json
{"resume_id":"resume_<uuid>","jd_id":"jd_<uuid>"}
```

MatchResult 保持团队原约定：两个关联 ID、0–100 有限数值 `score`、字符串数组 `matched_skills`、`missing_skills`、`gap_analysis`。MatchRecord 另有 `id=match_<uuid>`、`is_mock`。Mock 固定 0 分只代表占位，不可作为真实评分展示。

2026-09-10 向后兼容新增 `keyword_score`（纯关键词覆盖率）和 `ai_assessment`（默认为 null）。原 `score` 继续保留原有关键词/可选向量增强口径，DeepSeek 不改写该字段。关键词匹配可从已确认 `resume.skills` 的描述句中识别词表关键词，仍不读取存档 `raw_text` 恢复用户移除的技能；否定及学习意向片段不作为命中证据。

`POST /api/v1/matches/{id}/assessment` 无请求体，返回 200 MatchRecord。用户主动发起后，Jobs 的可选公开 `assess(Resume, JD)` 方法使用 DeepSeek 评估已确认的教育、技能及经历。成功将 `ai_assessment` 保存到原匹配记录，GET 和后续相同 POST 可复用；失败返回 502，保留关键词记录，不自动重试或降级为 Mock。Mock 输入返回 409，不支持该方法的 provider 返回 503。

`ai_assessment` 包含 `score`、`summary`、`model` 和三个 `dimensions`：`skills`、`experience`、`education`。每项有 `applicable`、0–100 整数 `score`、`reason`、`jd_quotes`、`resume_quotes`。服务校验引文来自本次输入、完整正常结束、维度齐全且无重复；没有简历引文或只有否定/意向引文时拒绝正分。总分由服务按技能 50%、经历 35%、教育 15% 加权；不适用维度排除后重新归一化。该分数是有证据约束的 AI 判断，不是经过录用结果校准的概率。详情和验证见 [匹配评估记录](matching-assessment.md)。

引文是原文片段，不使用短标签的 200 字符限制。`jd_quotes` 和 `resume_quotes` 每项均为保留空白的非空字符串，上限 60,000 字符，与整份评估输入上限对齐；逐字来源校验及 256 KiB 响应体上限仍执行，不通过截断正文满足限制。公共结果每类最多 5 条；内部有限容纳多余引用，全部校验后去重并选择展示内容。前端字段类型仍是字符串数组，已有结果兼容。

D 的公开方法收到 `{"resume_text":"原文","jd_text":"原文"}`，返回 `{"summary":"诊断摘要","suggestions":["建议"]}`。HTTP 接口通过 PairInput 读取公共记录后调用 D，返回 DiagnosisRecord（加 `id`、关联 ID、`is_mock`）。

analytics 的公开方法仍为 `analyze(list[JD]) -> AnalysisResult`，兼容旧的 summary/skills 返回；新增可选 market，旧 provider 默认 market=null。HTTP 响应增加 is_mock 和 scope。默认真实入口为 `backend.modules.analytics.public:AnalyticsService`。

### Analytics 口径与响应

`GET /analytics?source_type=real&date_from=2026-09-01&date_to=2026-09-08`：来源可省略表示全部；日期边界闭区间，起点晚于终点返回 422。指定日期边界时排除无采集日期记录，绝不以录入日期填补。real 筛选额外排除 Mock 输入；不筛来源时保持旧 Mock 传播行为。前端默认选择 real，普通手动输入未标来源的 JD 在 unknown/全部筛选中可见。

| 响应字段 | 内容 |
| --- | --- |
| summary / skills | 摘要 / 以技能展示名为键、包含该技能的 JD 数量为值的字典，兼容旧字段 |
| scope | source_type、date_from/date_to、available_count（全库记录数）、selected_count、mock_count、excluded_mock_count |
| market.sample_size / company_count / unknown_company_count | 当前筛选 JD 数、已知雇主数、雇主未知记录数 |
| market.source_counts / collected_from / collected_to / undated_count | 当前筛选的来源组成、实际采集日期范围及无日期数 |
| market.skill_frequency | `{skill, job_count, share_percent}` 数组，按数量降序，同数量按规范化名称排序；词云与频率条形图使用同一数据 |
| market.jobs | 逐岗 jd_id、title、company、skills、来源字段、salary 原文、salary_status；不回传大段 JD 原文 |
| market.salary_coverage | comparable_count、missing_range_count、missing_unit_count，三者之和为 sample_size |
| market.salary_groups | `{currency, period, sample_size, ranges:[{jd_id,title,lower,upper}]}`；每个币种/周期独立分组 |
| market.observations | 数据口径、样本内观察、缺失值与偏差说明，不外推整个市场 |

技能统计仅消费已保存 skills；NFKC/大小写/空白规范化后每条 JD 同一关键词只计一次，不重新解析原文、不额外叠加 tools、不推断同义词。比例分母为当前筛选全部 JD，多个技能可以重叠。逐岗列表保留完整技能，页面词云前 30、条形图前 15，标注展示范围并提供全部频率表。

薪资缺任一上下界计 missing_range；有上下界但币种不是明确三字母标签（或为 XXX），或周期不在 hour/day/month/year，计 missing_unit。只有其余记录进入 comparable 分组；币种大小写统一为大写、周期为小写，除此之外不折汇、不跨周期换算。unknown 不填零，明确输入的 0 元区间则保留为真实数值。图中画原区间，不用区间中点冒充实际工资。不同组使用独立刻度。

`POST /analytics/sample-jobs` 只读仓库固定的 2026-09-08 五份 Canonical 来源快照，通过当前 Jobs provider 解析并保存来源与原文；不联网采样，不把福利预算转成薪资。重复调用返回 existing，不覆盖用户确认字段。需要真实 Jobs provider；Mock 时 409。导入与整批保存同事务，真实 PG 并发导入不会重复计数。返回 ID 可能为 `jd_market_<hash>`，客户端始终把 ID 当不透明值。

简历原文必须非纯空白且 ≤ 50,000 字符，保留原始空白；JD 原文等其他 Text 字段仍沿用 v1 首尾去空白规则。title、技能/工具、币种/周期及关联 ID 最多 200 字符；简历技能/经历及 JD 技能/工具数组最多 500 项。name、education、company 是可选描述字段，暂未统一长度约束。

## Mock 与错误约定

简历/JD 成功响应带 `X-T5-Mock: true|false`，列表头表示当前页是否含 Mock 数据；计算结果直接返回 `is_mock`，继承输入来源。前端须展示 Mock 标签；不能只根据分数推断真实性。`/modules` 显示当前配置，历史记录标识保留其创建时来源。

错误形如 `{"error":{"code":"404","message":"记录不存在"}}`。422 包含字段位置与类型 `details`，不含原文输入；404 为记录/路由不存在，502 为模块错误或输出契约不匹配，503 为数据库不可用。`/ready` 的 503 message 为包含 mock_modules 的对象。模块输出错误不会静默降级。

## 变更记录

- 2026-09-08（Diagnosis 集成适配）：诊断/工作流将已保存的 name/education/skills/experience 组成模型输入，原 raw_text 仅存档，不恢复用户删除的事实；全空值明确传达未提供信息。确认内容超过 DiagnosisInput 50,000 字符限制返回 422，不截断。前端两项 AI POST 超时为 120 秒，其余请求仍为 45 秒；服务端非默认超长配置可能先触发页面超时，重试仍由用户发起。

- 2026-09-08（A 产品阶段）：Resume 编辑器与保守章节修复；JD 来源字段及迁移 5；默认真实 Analytics、来源/日期筛选、market/scope 可选扩展及固定快照导入。JDInput、PairInput、MatchResult 与 Diagnosis 协议保持不变。

- 2026-09-08：发布兼容的 JDCreate、tools/薪资公共字段与旧记录迁移；JDInput provider port 不变。默认接入 ResumeService / JobsService；新增 Resume preview 与可选倒序列表。向量接口见 [PostgreSQL 与向量契约](postgres.md)。

- 2026-09-07：增加同源公共前端壳与合成样例静态入口；根页面不再跳转 Swagger，`/docs` 保持可用。未改变现有业务 API 的输入输出。
- 2026-09-07：公开 provider 启动时校验无参类与同步方法签名；可用布尔 `is_mock=True` 标识自定义示例，结果继续标注 Mock。analytics 的基础样例统计以“包含该技能的岗位数”为口径，详见 `examples/fixtures/team.json`；不要求匹配分数等于固定示例分数。未改动 v1 JSON 字段。
- 2026-09-07：建立 v1。保留团队建议字段，补充诊断/分析输出、持久化标识、Mock 来源及错误契约。当前未冻结为跨团队最终版；后续新增字段、适配说明在此记录，破坏性修改需新 API 版本。

## 严格 T5 后续契约

以上字段已实现并验证；后续仍须完成最终系统与真实效果验收。

- 简历编辑：已实现 UI 与保存重读，规则解析仍可能遗漏，需要人工核对；未将自动解析当事实认证。
- JD/分析：来源、技能与分组薪资口径已提供；扩大真实雇主和薪资样本、人工效果评估仍待完成，当前五份快照均未知薪资。
- 向量：公共 VectorRepository 与 D 片段缓存已集成；显式 local 使用固定 MiniLM revision、t5-clauses-v2、384 维 cosine 和独立空间。语义增强默认 off，参数见 D embedding 契约；公共仓储不指定业务默认模型。
- 保持现有调用兼容；新增可选字段应有默认/空值与旧数据验证，破坏性变更新建 API 版本。


### Jobs 可选事务上下文

公共编排优先调用 `match_with_context(resume, jd, context: MatchContext)`；未实现时继续调用旧 `match(resume,jd)`。
context 由公共层逐次注入，`with context.vector_repository() as vectors` 提供同一请求 Session 的片段仓储及缓存保存点。
完整的有序片段、版本/hash、清空和失败语义见 [PostgreSQL 契约](postgres.md#有序片段缓存与-jobs-事务入口2026-09-08)。HTTP JSON 契约不变。

## 外部市场岗位同步（2026-09-10）

`POST /api/v1/analytics/external-jobs` 显式同步公开招聘记录。可选 query `source=jobicy|ncss`，默认 Jobicy（最多 200 条全球远程岗位）；NCSS 请求最多 30 条国内招聘，实际以来源返回数量为准。不接受用户自定义上游地址；不上传简历/JD 或调用 AI。需真实 Jobs provider，否则 409。

响应：`created`、`existing`、`skipped`、`jd_ids`、`fetched_at`（ISO 采集时间）、`cached`、`source`（Jobicy 或国家大学生就业服务平台）。上游缓存 1 小时并持久化在忽略的 `.runtime/jobicy.json` / `.runtime/ncss.json`；不后台轮询。网络/格式/缓存写入失败返回 502，原业务数据保持不变。

新岗位通过 Jobs 公开解析端口处理；来源 HTML 转纯文本，保留地理限制、层级、发布日期文字、Jobicy 链接与采集日期。薪资只接收上游明确的上下限/币种/周期，缺失不推断。广泛英语岗位中的裸 `go` 不作 Go 技能证据，仅保留明确语言或技术列表语境；技能提取仍是有限词表自动识别。

按来源前缀与上游 ID 去重，重复数据保留首次入库版本，不覆盖用户确认内容或已有匹配关联。空列表合法，超长标题/正文、非法来源等不合契约记录计入 skipped。已保存岗位为累计采集快照，不保证仍在招聘。

历史 `/analytics/sample-jobs` 接口及课程归档文件保留；市场页面已移除旧五份 Canonical 快照导入入口。

NCSS 从国家大学生就业服务平台公开列表与详情页读取，详情正文只取 `pre.mainContent`，并发最多 3 个；详情缺失跳过，全部无法读取返回 502。只保存原文与明确的地区、学历、专业信息，来源链接固定在 ncss.cn。官方列表薪资为 K/月，明确的正数上下限乘 1000 保存为 CNY/month；0/0（面议）、单边缺失或倒置区间不参与薪资比较。保留首次采集版本，手动再次同步不会覆盖用户编辑。

## 本机 AI 设置与退出

新增 `/api/v1/settings/ai` 配置组，支持多供应商保存、各模块选择、显式密钥显示、连接测试、恢复和保存退出。完整字段与生命周期见 [AI 设置接口](ai-settings.md#接口)。现有简历/JD、评分、STAR 和事实约束保持原契约；匹配综合评估的服务地址现可配置。
