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
| `POST /api/v1/resumes` | ResumeData | 201，保存结构化简历，Resume |
| `GET /api/v1/resumes` | `limit=20&offset=0` | Resume 数组 |
| `GET /api/v1/resumes/{id}` | 无 | Resume |
| `POST /api/v1/jobs` | JDInput | 201，JD |
| `GET /api/v1/jobs` | `limit=20&offset=0` | JD 数组 |
| `GET /api/v1/jobs/{id}` | 无 | JD |
| `POST /api/v1/matches` | PairInput | 201，MatchRecord |
| `GET /api/v1/matches/{id}` | 无 | MatchRecord |
| `POST /api/v1/diagnoses` | PairInput | 201，DiagnosisRecord |
| `GET /api/v1/diagnoses/{id}` | 无 | DiagnosisRecord |
| `POST /api/v1/workflow` | PairInput | 201，`{"match": MatchRecord, "diagnosis": DiagnosisRecord}` |
| `GET /api/v1/analytics` | 无 | AnalysisResponse，基于当前全部 JD |

列表 limit 1–100，offset ≥ 0，按创建时间、ID 升序。当前为小型课程数据集，全量分析由 E 接口接收全部 JD；扩大数据量前需增加公共分页/聚合接口。POST 非幂等，每次创建新记录。

## 数据结构

ResumeData：

```json
{"name":"示例","education":"本科","skills":["Python","SQL"],"experience":["数据分析项目"],"raw_text":"完整简历文本"}
```

`raw_text` 必填，其余字段有默认值；Resume 在其上增加服务端 `id=resume_<uuid>`。结构化保存不进行技能推断。

JDInput / JD：

```json
{"title":"数据分析师","company":"示例公司","jd_text":"需要 Python 和 SQL"}
```

`company` 可省略；JDData 增加 `skills` 数组，JD 再增加 `id=jd_<uuid>`。

PairInput：

```json
{"resume_id":"resume_<uuid>","jd_id":"jd_<uuid>"}
```

MatchResult 保持团队原约定：两个关联 ID、0–100 有限数值 `score`、字符串数组 `matched_skills`、`missing_skills`、`gap_analysis`。MatchRecord 另有 `id=match_<uuid>`、`is_mock`。Mock 固定 0 分只代表占位，不可作为真实评分展示。

D 的公开方法收到 `{"resume_text":"原文","jd_text":"原文"}`，返回 `{"summary":"诊断摘要","suggestions":["建议"]}`。HTTP 接口通过 PairInput 读取公共记录后调用 D，返回 DiagnosisRecord（加 `id`、关联 ID、`is_mock`）。

E 的公开方法接收 `list[JD]`，返回 `{"summary":"分析摘要","skills":{"Python":3}}`；HTTP 响应再加 `is_mock`。此结构是基础统计交接点，不是最终看板图表契约，薪资及图表字段需 E 提交集成请求后扩展。

文本去除首尾空白后必须非空且 ≤ 50,000 字符；title、技能及关联 ID 最多 200 字符；简历技能/经历及 JD 技能数组最多 500 项。name、education、company 是可选描述字段，暂未统一长度约束。

## Mock 与错误约定

简历/JD 成功响应带 `X-T5-Mock: true|false`，列表头表示当前页是否含 Mock 数据；计算结果直接返回 `is_mock`，继承输入来源。前端须展示 Mock 标签；不能只根据分数推断真实性。`/modules` 显示当前配置，历史记录标识保留其创建时来源。

错误形如 `{"error":{"code":"404","message":"记录不存在"}}`。422 包含字段位置与类型 `details`，不含原文输入；404 为记录/路由不存在，502 为模块错误或输出契约不匹配，503 为数据库不可用。`/ready` 的 503 message 为包含 mock_modules 的对象。模块输出错误不会静默降级。

## 变更记录

- 2026-09-07：增加同源公共前端壳与合成样例静态入口；根页面不再跳转 Swagger，`/docs` 保持可用。未改变现有业务 API 的输入输出。
- 2026-09-07：公开 provider 启动时校验无参类与同步方法签名；可用布尔 `is_mock=True` 标识自定义示例，结果继续标注 Mock。E 的基础样例统计以“包含该技能的岗位数”为口径，详见 `examples/fixtures/team.json`；不要求匹配分数等于固定示例分数。未改动 v1 JSON 字段。
- 2026-09-07：建立 v1。保留团队建议字段，补充诊断/分析输出、持久化标识、Mock 来源及错误契约。当前未冻结为跨团队最终版；后续新增字段、适配说明在此记录，破坏性修改需新 API 版本。
