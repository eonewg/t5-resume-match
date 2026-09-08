# 公共 API 契约 v1

前缀 `/api/v1`，JSON 请求/响应；动态 OpenAPI 为 `/openapi.json`，交互文档 `/docs`。契约模型在 `backend/schemas/contracts.py`，未知输入字段拒绝，错误不回显简历内容。

## 路由

| 方法与路径 | 请求 | 成功响应 |
| --- | --- | --- |
| `GET /` | 无 | 公共工作台 HTML，替代原来跳转 `/docs` 的行为 |
| `GET /assets/{path}` | 无 | 前端静态资源，仅限 frontend/src |
| `GET /demo/sample.json` | 无 | 明确标注的合成样例 JSON，与成员自检共用 |
| `GET /health` | 无 | 200，数据库连接正常 |
| `GET /ready` | 无 | 200 全部配置真实入口；503 尚有 Mock |
| `GET /api/v1/modules` | 无 | 四个入口的 `is_mock` |
| `POST /api/v1/resumes/parse` | `{"raw_text":"简历原文"}` | 201，Resume |
| `POST /api/v1/resumes/preview` | `{"raw_text":"简历原文"}` | 200，ResumeData 草稿；不写库 |
| `POST /api/v1/resumes` | ResumeData | 201，保存结构化简历，Resume |
| `GET /api/v1/resumes` | `limit=20&offset=0&order=asc` | Resume 数组；可用 order=desc 读最新记录 |
| `GET /api/v1/resumes/{id}` | 无 | Resume |
| `POST /api/v1/jobs` | JDCreate（兼容原 JDInput 请求） | 201，JD |
| `GET /api/v1/jobs` | `limit=20&offset=0` | JD 数组 |
| `GET /api/v1/jobs/{id}` | 无 | JD |
| `POST /api/v1/matches` | PairInput | 201，MatchRecord |
| `GET /api/v1/matches/{id}` | 无 | MatchRecord |
| `POST /api/v1/diagnoses` | PairInput | 201，DiagnosisRecord |
| `GET /api/v1/diagnoses/{id}` | 无 | DiagnosisRecord |
| `POST /api/v1/workflow` | PairInput | 201，`{"match": MatchRecord, "diagnosis": DiagnosisRecord}` |
| `GET /api/v1/analytics` | 无 | AnalysisResponse，基于当前全部 JD |

列表 limit 1–100，offset ≥ 0，按创建时间、ID 升序。当前为小型课程数据集，全量分析由 A 的 analytics 接口接收全部 JD；扩大数据量前需增加公共分页/聚合接口。POST 非幂等，每次创建新记录。

## 数据结构

ResumeData：

```json
{"name":"示例","education":"本科","skills":["Python","SQL"],"experience":["数据分析项目"],"raw_text":"完整简历文本"}
```

`raw_text` 必填且逐字保留（含首尾空白和换行），纯空白拒绝；其余字段有默认值，未知 name 为 null。Resume 在其上增加服务端 `id=resume_<uuid>`。结构化保存不进行技能推断。preview 用于编辑前草稿，POST /resumes 保存确认后的新版本；不覆盖历史记录。

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

HTTP 层只向旧 provider 传 JDInput；provider 可返回完整 JDData。客户端显式给出的确认字段覆盖解析结果（包括 skills=[]、salary=null），省略的字段保留 provider 结果。
真实 Jobs 的 tools 输出采用 D 已有工具标签规则，`Python SQL Docker` 返回 `["Docker", "Python", "SQL"]`。PR #6 已集成保守薪资解析与可选语义缓存；仅解析明确薪资表达，不猜测币种/周期。A 不另写关键词算法。
所有可选字段写入 jobs.payload JSON，列表/按 ID 读取完整返回；旧 JSON 缺失字段按默认值兼容，并通过 migration 2 非破坏性补齐，保留已有值、ID、时间和 Mock 来源。
来源时间、URL、采样标签仍保存在验收数据文件中，不作为未定义的 API 输入。

PairInput：

```json
{"resume_id":"resume_<uuid>","jd_id":"jd_<uuid>"}
```

MatchResult 保持团队原约定：两个关联 ID、0–100 有限数值 `score`、字符串数组 `matched_skills`、`missing_skills`、`gap_analysis`。MatchRecord 另有 `id=match_<uuid>`、`is_mock`。Mock 固定 0 分只代表占位，不可作为真实评分展示。

D 的公开方法收到 `{"resume_text":"原文","jd_text":"原文"}`，返回 `{"summary":"诊断摘要","suggestions":["建议"]}`。HTTP 接口通过 PairInput 读取公共记录后调用 D，返回 DiagnosisRecord（加 `id`、关联 ID、`is_mock`）。

analytics 的公开方法接收 `list[JD]`，返回 `{"summary":"分析摘要","skills":{"Python":3}}`；HTTP 响应再加 `is_mock`。此结构是基础统计交接点，不是最终看板图表契约，薪资、来源、时间范围及图表字段仍待 A/D 对齐后由 A 扩展，当前 v1 不接受这些未知字段。

简历原文必须非纯空白且 ≤ 50,000 字符，保留原始空白；JD 原文等其他 Text 字段仍沿用 v1 首尾去空白规则。title、技能/工具、币种/周期及关联 ID 最多 200 字符；简历技能/经历及 JD 技能/工具数组最多 500 项。name、education、company 是可选描述字段，暂未统一长度约束。

## Mock 与错误约定

简历/JD 成功响应带 `X-T5-Mock: true|false`，列表头表示当前页是否含 Mock 数据；计算结果直接返回 `is_mock`，继承输入来源。前端须展示 Mock 标签；不能只根据分数推断真实性。`/modules` 显示当前配置，历史记录标识保留其创建时来源。

错误形如 `{"error":{"code":"404","message":"记录不存在"}}`。422 包含字段位置与类型 `details`，不含原文输入；404 为记录/路由不存在，502 为模块错误或输出契约不匹配，503 为数据库不可用。`/ready` 的 503 message 为包含 mock_modules 的对象。模块输出错误不会静默降级。

## 变更记录

- 2026-09-08：发布兼容的 JDCreate、tools/薪资公共字段与旧记录迁移；JDInput provider port 不变。默认接入 ResumeService / JobsService；新增 Resume preview 与可选倒序列表。向量接口见 [PostgreSQL 与向量契约](postgres.md)。

- 2026-09-07：增加同源公共前端壳与合成样例静态入口；根页面不再跳转 Swagger，`/docs` 保持可用。未改变现有业务 API 的输入输出。
- 2026-09-07：公开 provider 启动时校验无参类与同步方法签名；可用布尔 `is_mock=True` 标识自定义示例，结果继续标注 Mock。analytics 的基础样例统计以“包含该技能的岗位数”为口径，详见 `examples/fixtures/team.json`；不要求匹配分数等于固定示例分数。未改动 v1 JSON 字段。
- 2026-09-07：建立 v1。保留团队建议字段，补充诊断/分析输出、持久化标识、Mock 来源及错误契约。当前未冻结为跨团队最终版；后续新增字段、适配说明在此记录，破坏性修改需新 API 版本。

## 严格 T5 后续契约

以上 2026-09-08 字段已实现并验证；以下仍为待办，不能按已完成验收。

- 简历编辑：现有 POST /resumes 接收编辑后的 ResumeData 并生成新 ID，GET 可重新读取。A 的编辑器须保留原文，显示编辑结果；不能把已有 API 当作 UI 已完成。
- JD：工具/薪资解析及展示已随 PR #6 集成；来源分类和采样时间的 API 扩展仍待明确。
- 分析：目前只有 summary/skills，尚不足以承载薪资分布、岗位技能分布和时间/来源口径。A 明确响应结构、同步前端和测试，不提前展示不存在的接口。
- 向量：公共 VectorRepository 与 D 片段缓存已集成；显式 local 使用固定 MiniLM revision、t5-clauses-v2、384 维 cosine 和独立空间。语义增强默认 off，参数见 D embedding 契约；公共仓储不指定业务默认模型。
- 保持现有调用兼容；新增可选字段应有默认/空值与旧数据验证，破坏性变更新建 API 版本。


### Jobs 可选事务上下文

公共编排优先调用 `match_with_context(resume, jd, context: MatchContext)`；未实现时继续调用旧 `match(resume,jd)`。
context 由公共层逐次注入，`with context.vector_repository() as vectors` 提供同一请求 Session 的片段仓储及缓存保存点。
完整的有序片段、版本/hash、清空和失败语义见 [PostgreSQL 契约](postgres.md#有序片段缓存与-jobs-事务入口2026-09-08)。HTTP JSON 契约不变。
