# T5 数据资产（JD / 简历 / 人工 baseline）

本目录是 T5「AI 简历诊断与岗位匹配系统」的统一数据资产目录，服务课程明确的四项要求：5+ 真实 JD、3+ 学生简历、表达/技能差距分析、Level 3 市场分析（技能词云 / 薪资分布 / 技能要求分布）。

数据由 A 维护；D 按交接文档使用：[D 数据交接](../docs/integration_requests/D-data-handoff.md)。

## 目录结构

```
data/
  README.md                  数据规范与口径（本文件）
  jd/
    jd-real.json             真实采集 JD（source_type=real_web）
    jd-synthetic.json        合成演示 JD（source_type=synthetic）
  resumes/
    resume-01.json ... resume-05.json   脱敏/合成简历
  baselines/
    gap-baseline.json        5 JD × 3 简历人工 gap baseline（机读）
    gap-baseline.csv         同内容速览表
  collection/
    collection-log.md        采集日志：来源、请求数、失败与被拦记录
  t5.db                      现有 SQLite 演示库（公共层已有，未改动）
```

## JD 数据规范

文件为 JSON 数组，每条字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `jd-real-NN` / `jd-syn-NN`，全库唯一 |
| `category` | string | 管理用方向分类：`数据分析`/`数据科学`/`AI算法`/`后端开发`/`大数据`/`数据产品`；非公共契约字段 |
| `title` | string | 招聘职位原文标题 |
| `company` | string | 用人单位原文；synthetic 用占位名称 |
| `location` | string | 工作地点原文 |
| `salary_raw` | string\|null | JD/页面上的薪资原文（如 `45-60K·16薪`、`面议`） |
| `salary_min` / `salary_max` | number\|null | 归一月薪下/上限，单位 K（千元/月）；`面议`或无法解析时为 `null`（T5 允许空值） |
| `salary_unit` | string\|null | 统一为 `K/月`；未归一时 `null` |
| `raw_text` | string | JD 原文（岗位职责+任职要求），逐字保留；转写压缩版在 `notes` 标注 |
| `skills_manual` | string[] | 人工标注的技能关键词（A 人工采样整理，非算法输出） |
| `tools_manual` | string[] | 人工标注的工具/技术栈关键词 |
| `source_type` | string | `real_web` / `course` / `synthetic`（简历另有 `real_anonymized` / `public`，见下） |
| `source_name` | string | 来源名称（如 `国家大学生就业服务平台`） |
| `source_url` | string\|null | 采集页 URL；synthetic 为 `null` |
| `collected_at` | string | ISO 日期（采集/整理日期） |
| `notes` | string | 保真度、薪资口径等补充说明 |

### source_type 定义

- `real_web`：从无需登录的公开页面采集的真实岗位 JD，附 `source_url`。采集遵守：不绕过登录/验证码/访问控制、不限速高并发爬取、单页少量请求、被拦来源立即停止（见采集日志）。
- `course`：课程/教学材料提供的样本（当前为空，若有将标记于此）。
- `synthetic`：参照真实 JD 结构人工编写的演示数据，**不是在招岗位**，用于补足 Level 3 图表所需样本量；`source_url=null`，`company` 为虚构占位。

### 薪资口径

- 统一归一为月薪 `K`（千元/月）。`45-60K·16薪` 归一为 min=45、max=60，`16薪` 写入 `notes`，不改变月薪区间。
- `面议`、时薪、年薪无法可靠归一时：`salary_min/max/unit` 全为 `null`，`salary_raw` 保留原文。

### skills_manual / tools_manual 标注口径

- 人工标注，来源为 `raw_text` 原文中的显式词或业内无歧义的等价词；同义词归一化（如 `Java/python/C++` → `Java`、`Python`、`C++`）留给系统侧处理，标注不合并原词。
- 大小写：技术词统一 PascalCase/大写惯例（`MySQL`、`SQL`、`C#`）；中文词保留原文（`指标体系`）。
- 泛化描述（如"熟悉常用存储系统和中间件"）不拆词，写入 `notes` 而非强标 skills。

## 简历数据规范

文件为单个 JSON 对象（每份一份文件），字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `resume-NN`，与公共层简历 ID 独立 |
| `raw_text_anonymized` | string | 脱敏后的简历全文 |
| `education` | object | `{degree, major, school_generalized, period}` |
| `experiences` | object[] | `{role, org_generalized, period, highlights[]}` |
| `projects` | object[] | `{name_generalized, role, period, description, tech[]}` |
| `skills` / `languages` / `certificates` | string[] | 结构化字段 |
| `source_type` | string | `real_anonymized` / `public` / `course` / `synthetic` |
| `anonymized` | bool | 必须为 `true` 才可入库 |
| `notes` | string | 脱敏与泛化说明 |

### 脱敏规则（进入仓库前完成）

删除：姓名、手机号、邮箱、学号、身份证、详细住址、社交账号、个人主页、头像/照片及其他直接身份标识。
泛化：具体公司名→`某互联网公司`类；具体学校名→`某高校`；独特项目/竞赛名→通用描述；任何"学校+公司+竞赛+项目"组合仍可定位个人时继续泛化。
仓库不保存可反查身份的 `source_url`；来源审计信息只放本地 gitignored 文件。
当前 5 份简历全部为 `synthetic`（由本任务构造的演示数据），**没有**真实学生简历；真实简历须由组员提供授权并按本规则脱敏后补充，不得以 synthetic 冒充。

## 人工 baseline 规范

`baselines/gap-baseline.json` 与同名 CSV 为**人工标注**（`reviewer: manual(A)`），不得当作系统算法输出。5 份核心 JD × 3 份核心简历 = 15 组，每组字段：

`resume_id, jd_id, matched_skills_manual, missing_skills_manual, expression_gaps_manual, skill_gaps_manual, suggested_keywords_manual, match_level_manual, reviewer, notes`

`match_level_manual` 为人工相对判断（`high`/`medium`/`low`），与任何算法分数无关；D 应将其与系统输出对照验证一致性（见交接文档）。

## 与公共 Schema 的关系

公共契约 `backend/schemas/contracts.py` 当前为 `ResumeData(name, education, skills, experience, raw_text)` / `JDInput(title, company, jd_text)` / `JDData(+skills)`。本目录数据文件字段更丰富，**本次不改公共接口**；后续公共层可能需要支持的字段（由数据使用方按集成请求提出）：

- JD：`salary_min/max/unit`（Level 3 必需）、`location`、`source_type`/`source_name`/`source_url`、`skills_manual`/`tools_manual`
- Resume：`experiences/projects/languages/certificates` 结构化字段、`anonymized` 标记

## PostgreSQL/pgvector 入库映射（设计，不硬编码向量维度）

| 数据 | 普通列 | JSON/JSONB | 向量（pgvector） |
|---|---|---|---|
| JD | `id, title, company, location, salary_min, salary_max, source_type, collected_at` | `raw_text`(text), `skills_manual`(text[]/jsonb), `tools_manual`, `salary_raw`, `notes` | JD 文本 embedding，**维度/模型/距离由 D 明确后落列**（当前不建列） |
| Resume | `id, source_type, anonymized, created_at` | `raw_text_anonymized`(text), `education/experiences/projects/skills/languages/certificates`(jsonb) | 简历文本 embedding，同上 |
| baseline | `resume_id, jd_id, match_level` | 各 gap 字段(jsonb) | 无 |

统计/分析（词云、薪资分布、技能要求分布）直接对 `skills_manual`、`salary_min/max`、`category` 做聚合，不需要向量。embedding 落库在 D 给出维度后按集成请求实现。

## 数据缺口（如实记录）

- 真实 JD 共 9 份（≥5 达标），但方向不均：数据分析 4、AI算法 2、后端 2、数据产品 1；大数据/数据科学方向**无真实 JD**，由 synthetic 补足样本量，Level 3 图表需按 `source_type` 分层展示。
- 4 份真实 JD（jd-real-06~09）来自公开汇总文章的转写，原文有压缩，保真度说明见各条 `notes` 与采集日志。
- 学生简历 0 份真实（5 份 synthetic）；需组员授权提供真实简历并按规则脱敏。
- 招聘 APP 竞品分析基于公开资料整理，真机体验记录待人工补充（见 `docs/competitor-analysis.md`）。
