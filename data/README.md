# T5 数据资产（JD / 简历 / 人工 baseline）

本目录是 T5「AI 简历诊断与岗位匹配系统」的统一数据资产目录，服务课程明确的四项要求：5+ 真实 JD、3+ 学生简历、表达/技能差距分析、Level 3 市场分析（技能词云 / 薪资分布 / 技能要求分布）。

数据由 A 维护；D 按交接文档使用：[D 数据交接](../docs/integration_requests/D-data-handoff.md)。

2026-09-08 另建 [独立 holdout](holdout/2026-09-08/README.md)：5 个新真实 JD + 3 份公开学生时期简历，保留来源/固定版本/许可与去标识化说明，不参与原 D 词表调整。以下 30 JD / 10 合成简历与 40 配对统计仍仅指原数据集；公开历史学生履历不改标为本班学生授权样本。

## 目录结构

```
data/
  README.md                  数据规范与口径（本文件）
  jd/
    jd-real.json             真实采集 JD（source_type=real_web）
    jd-synthetic.json        合成演示 JD（source_type=synthetic）
  resumes/
    resume-01.json ... resume-10.json  脱敏/合成简历（10 份，全部 synthetic）
  baselines/
    gap-baseline.json        第一轮人工 gap baseline：5 JD × 3 简历 = 15 组（机读）
    gap-baseline.csv         同内容速览表
    gap-baseline-round2.json 第二轮人工 gap baseline：5 JD × 5 简历 = 25 组（机读）
    gap-baseline-round2.csv  同内容速览表
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
本目录 `resumes/` 下 10 份简历全部为 `synthetic`（由 A 构造的演示数据，resume-06~10 为 2026-09-07 第二批）。另见 holdout 中 3 份公开学生时期履历；若采集组员本人的当前简历仍须获得授权并脱敏，不得以 synthetic 冒充。

### 简历样本构成（10 份）

| id | 方向 | 学历 / 届别 | 质量档位 | 刻意保留的诊断点（要点） |
|---|---|---|---|---|
| resume-01 | 数据分析 | 本科 统计学 / 2026 届 | 第一批未标注 | 见该文件 `notes` |
| resume-02 | Java 后端 | 本科 计算机科学与技术 / 2026 届 | 第一批未标注 | 见该文件 `notes` |
| resume-03 | AI 算法（NLP/RAG） | 硕士在读 计算机技术 / 2027 届 | 第一批未标注 | 见该文件 `notes` |
| resume-04 | 数据科学 / 统计建模 | 本科 数学与应用数学 / 2026 届 | 第一批未标注 | 见该文件 `notes` |
| resume-05 | 大数据 | 本科 软件工程 / 2026 届 | 第一批未标注 | 见该文件 `notes` |
| resume-06 | 数据分析 | 本科 数据科学与大数据技术 / 2026 届 | **高** | 1 条纯过程描述；小组项目个人贡献边界不清；Tableau 列在技能行但全篇无佐证 |
| resume-07 | Java 后端 | 本科 软件工程 / 2026 届 | 中 | “负责部分技术文档的编写工作”等模糊条目；JVM/多线程写了但项目零佐证；无并发量与性能量化；用产品名而非 JD 的“存储系统/中间件”泛称 |
| resume-08 | AI 算法（推荐/CTR） | 硕士在读 计算机技术 / 2027 届 | 中 | 实习 4 条全是“参与/协助”无业务结果；成果仅离线 AUC 与在投论文；缺 Java/C++ 与上线工程指标；主修含 C 语言但技能行未列 |
| resume-09 | 大数据 | 本科 物联网工程 / 2026 届 | **低** | “负责数据处理相关工作”“完成领导交办的其他任务”等空泛条目；“编写了几个 MapReduce 程序”无法判断能力；只写输入数据量不写结论；缺实时/调度/建模/Java；毕业后经历空窗 |
| resume-10 | 数据产品 | 本科在读 市场营销 / 2027 届 | **低** | 求职意向与内容脱节（无一条数据产品经历）；无正式实习（仅校园与寒假兼职）；技能全为“熟练/会/了解”自评加软技能堆砌；缺 JD 全部关键词；无关证书（驾照）噪声 |

第二批档位分布为 1 高 / 2 中 / 2 低，用于同时验证“优质简历不应被过度挑刺”（resume-06）与“空泛简历应被如实指出差距”（resume-09、resume-10）。每份的诊断点明细写在该文件 `notes` 字段，人工标注结果见 `baselines/gap-baseline-round2.json`。

## 人工 baseline 规范

两轮 baseline 同时有效、互不替代，均为**人工标注**（`reviewer: manual(A)`），不得当作系统算法输出：

| 文件 | 网格 | 核心 JD | 核心简历 | 组数 | 人工档位分布 |
|---|---|---|---|---|---|
| `gap-baseline.json` + `.csv` | 5 JD × 3 简历 | `jd-real-01/03/04/05/09` | `resume-01/02/03` | 15 | low 10 / medium 4 / high 1 |
| `gap-baseline-round2.json` + `.csv` | 5 JD × 5 简历 | `jd-real-01/04/05/07/09` | `resume-06`~`resume-10` | 25 | low 19 / medium 5 / high 1 |

每组字段：

`resume_id, jd_id, matched_skills_manual, missing_skills_manual, expression_gaps_manual, skill_gaps_manual, suggested_keywords_manual, match_level_manual, notes`

JSON 中 `reviewer` 位于文件顶层，CSV 中每行都带 `reviewer` 列；`pair_id` 第一轮为 `baseline-NN`，第二轮为 `baseline-r2-NN`，两轮不重号。核心 JD / 简历 ID 写在各文件的 `core_jd_ids` / `core_resume_ids`，`scripts/validate_data.py` 据此校验网格完整性（组数必须等于两者乘积，且实际用到的 ID 集合必须与声明一致）。

`match_level_manual` 为人工相对判断（`high`/`medium`/`low`），与任何算法分数无关；D 应将其与系统输出对照验证一致性（见交接文档）。

第二轮中有几组是**为特定失效模式准备的对照样本**，校验时应重点看：

- `baseline-r2-05`（resume-06 × jd-real-09，high）：`missing_skills_manual` 故意为空，系统不应无中生有地编造缺失技能；同时该简历仍有 3 处可优化表达，系统不应因整体质量高就完全不提改进点。
- `baseline-r2-04`（resume-06 × jd-real-07，medium）：关键词命中最多的一组（RFM/用户运营/用户规划/数据分析），但 JD 有“3 年以上新零售经验”硬门槛，人工只给 medium。系统若因命中词多判 high，即为误判。
- `baseline-r2-22`（resume-10 × jd-real-04，low）：彻底错配，`expression_gaps_manual` 与 `matched_skills_manual` 故意为空，系统不应编造表达优化建议。
- `baseline-r2-15`、`baseline-r2-25`：招聘范围类硬条件不符（2026 届本科 vs 2027 届硕士 / 2027 届在读），用于校验系统能否识别技能词之外的资格条件。
- `baseline-r2-07`（resume-07 × jd-real-04，medium）：STAR 改写收益最大的一组，5 条表达 gap 全部指向可核查的原文。

第二轮核心 JD 未覆盖大数据方向——真实 JD 中无大数据岗（见下方数据缺口），因此 resume-09 只能跨方向配对，5 组均为 low。这既反映数据缺口，也说明该样本的 gap 结论不能直接用于评估大数据岗匹配质量。

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
- 原有配对集的学生简历均为 synthetic；2026-09-08 holdout 另有 3 份公开学生时期简历，但尚无独立评测结果。本班学生的授权当前简历仍待采集。**原有简历分析结论仍仅针对合成样本，不能当作真实学生群体的画像。**
- 第二轮 baseline 的 5 份核心 JD 全部为 `real_web`，但真实 JD 中无大数据岗，故 resume-09（大数据方向）只能跨方向配对，5 组均为 low；大数据方向的匹配质量需等真实 JD 补采后另建 baseline。
- 第二轮档位分布 low 19 / medium 5 / high 1，low 占比高是刻意设计（5 份新样本中 2 份为低质量压力样本），不代表真实求职简历的质量分布。
- 招聘 APP 竞品分析基于公开资料整理，真机体验记录待人工补充（见 `docs/competitor-analysis.md`）。
