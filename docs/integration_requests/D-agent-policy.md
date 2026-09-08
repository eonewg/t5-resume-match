# D Agent：T5 严格开发约定

## 生效范围与依据

负责 T5「AI 简历诊断与岗位匹配系统」的 JD、matching、embedding 与 AI diagnosis。
本文件由用户提供的 AGENTS_D_T5_STRICT.md、T5_REQUIREMENTS_MATRIX.md、T5_TWO_PERSON_ALLOCATION_STRICT.md 综合优化。
开发 owner 为 A/D；课程正式小组组织形式按课程要求执行。
路径均相对于 `t5/t5-resume-match` 仓库根；不要在课程材料目录直接运行仓库 Git 命令。
用户当次明确指令决定任务范围；更新约定/文档的任务不自动扩展成实现所有功能。
原始参考材料是需求依据，不把其中示例、待办或推荐项误记为已经完成。

可共享的需求与分工依据：

- `T5_REQUIREMENTS_MATRIX.md`
- `T5_TWO_PERSON_ALLOCATION_STRICT.md`
- `docs/roles/D.md` 与 `docs/team-rules.md`
- 开发顺序、验收状态及公共请求：`docs/integration_requests/D-strict-plan.md`

## Git 与交付

唯一新开发分支为 `feat/intelligence-d`，基线与 PR 目标均为 `origin/feat/core-a` / `feat/core-a`。

1. 进入仓库，检查 `git status --porcelain`、当前分支、origin，然后 `git fetch origin`。
2. 有未知修改时不得覆盖、删除、stash 或 reset；解释冲突并保留现场。自己的已知修改可继续完成。
3. 新分支不存在：`git switch -c feat/intelligence-d origin/feat/core-a`。
   若远端已有该分支，先建立跟踪；本地已有则切换。不要重复创建或丢弃已有提交。
4. 工作区干净后用 merge 同步最新 `origin/feat/core-a`，不 rebase 已推送历史。
5. 仅解决自己模块/公共契约兼容冲突。保留 A 的公共设施；若必须改公共语义，写 D-* 集成请求。
6. 只暂存本次明确修改且属于 D 的路径，禁止 `git add .`。可验证的小任务完成后 commit/push。
7. 交付前再次 fetch，确认 HEAD 包含最新 `origin/feat/core-a`；若变化影响实现，重新验证。
8. push 到 `origin/feat/intelligence-d`；优先更新已有同 head/base PR，避免重复创建。
9. PR head=`feat/intelligence-d`，base=`feat/core-a`，不自行 merge。

禁止直接 push main、push 其他成员分支、force push、hard reset、重写公共历史或通过删测试绕过失败。
认证/权限失败或无法安全处理的冲突应明确报告，不做破坏性处理。
本地根 `AGENTS.md` 按团队规则保持 gitignored；共享版本放 D-* 文档，不修改 `.gitignore`。

## 责任范围

可修改：

- `backend/modules/jobs/`、`backend/modules/diagnosis/`
- `frontend/src/modules/jobs/`、`frontend/src/modules/diagnosis/`
- `tests/jobs/`、`tests/diagnosis/`
- `docs/integration_requests/D-*.md`
- 用户明确指定的本地 D 指令副本，不覆盖其他人的 AGENTS.md

A 负责公共 Schema/ports/API、数据库模型与迁移、PostgreSQL/pgvector、依赖/锁文件、CI/自检脚本、
共享前端与注册表、resume、analytics、样本管理、总报告和最终集成。不得直接修改这些文件。
现有公共契约优先；新增 tools/salary/embedding 接口需求写集成请求，不另起不兼容公共接口。
缺失依赖或接口时可在自己模块使用明确的替身推进测试，不伪装成公共能力已接通。

## 优先级与需求对应

每个新增功能先说明对应 T5 的哪条需求及验收证据。顺序为 Level 1 关键词基线、Level 2 诊断、
向量增强/Level 3 数据支持。所有 Level 1–3 主链路未完整可演示前，不优先开发无关功能。
不做 RAG、复杂多智能体、聊天、通用推荐流、复杂爬虫、无关 NLP 实验或非必要微服务。
最终系统仍需真实验证 PostgreSQL+pgvector 和向量增强；“增强”不意味着可以省略最终验收。

## Level 1：JD 与可解释关键词匹配

先实现 JD 原文输入后的解析，提取 skills/tools 与有依据的岗位信息；保留输入原文、标题和公司。
无法识别的信息保持空值。持久化与公共 API 由 A 负责，D 实现公开业务接口。
对齐现有 `backend.modules.jobs.public:JobsService` 的无参构造与同步 parse/match 方法。

必须有独立可验证的关键词基线：0–100 分、matched_skills、missing_skills/gap、简短评分解释。
说明去重、大小写/别名归一化、技能/工具集合与分母；不能只返回 cosine similarity。
建议基础公式为已匹配 JD 唯一关键词数 / JD 唯一关键词总数 × 100，实际落地后记录最终公式。
JD 无有效关键词时明确“无法有效评估”，不能当作全匹配；数值表示遵守公共契约并说明口径。
测试全/部分/无匹配、大小写、重复技能、无可识别 JD 技能、空/异常简历、原文不变及不修改输入对象。

## 向量增强与 A 的数据库边界

先保留关键词分数与 gap，再实现可替换 embedding 客户端。必须明确：

- 实际模型/版本、维度、向量化对象和预处理；未选定时写“待定”，不能虚构。
- cosine / inner product / L2 的选择、相似度方向与归一化公式。
- 关键词/向量分数权重、最终 0–100 分、异常/零向量/维度不符行为。
- 未启用 embedding、模型不可用或无向量库时如何退回关键词基线，并显示降级状态。

D 决定算法和接口；A 实现 pgvector 扩展、vector 列、索引、查询、持久化及集成测试。
内存向量、假 embedding 和 SQLite 测试都不是 PostgreSQL/pgvector 真实验证。
向量与真实 AI 的开关分开；向量降级不能导致真实诊断失败被伪装成成功。

## Level 2：STAR 与 JD 定向诊断

保持 `DiagnosisService.diagnose(DiagnosisInput) -> DiagnosisResult` 公共接口兼容。
STAR 清楚表达 Situation/Task/Action/Result，保留原文、优化文、理由；缺失信息使用“待补充”。
不得新增未经输入支持的公司、岗位、技能、职责、成果或数字；数字校验不是语义真实性证明。
JD 定向建议覆盖关键词强化、应突出的已有经历、技能 gap、表达 gap、量化成果补充位置及方法。
建议与已有事实明确区分，不要求把缺失技能写成已掌握。

模型客户端可替换，提示词独立，JSON/字段类型/长度校验，网络超时与有限总重试预算，成功结果有界缓存。
真实失败返回错误，不自动替换成 Mock 成功；离线替身全链路保留 Mock 标记。
默认测试禁止收费调用，不读取/打印真实密钥。真实调用必须有用户明确授权和可用环境配置。
密钥只从服务器环境/未提交 `.env` 读取，不进前端、日志、截图、测试、报告或 Git。

## Level 3 与问题定义材料

D 为 A 提供 title、skills、tools、salary（可空）与 raw_text 的可靠结构化信息。
技能适合聚合；薪资保留原文、范围、币种/周期等可确认口径，无法比较的薪资不强制换算。
公共 Schema 尚不支持的字段先提出兼容设计，不自行修改公共模型。

A 管理至少 5 份真实 JD、3 份学生简历、至少 2 款招聘 APP 的竞品记录与痛点报告。
D 对脱敏且来源清楚的样本提供技能/表达 gap、匹配验证和 AI 视角分析。
不索要无关身份信息；未收到真实样本时用标注为合成的数据测试，材料状态仍是未完成。
不得把 5 个 JD 外推为整个市场，也不能将桌面查看/合成样本冒充 APP 实际体验或学生真实数据。

## 公共前端

使用现有壳，模块导出 `mount(container, { api, getState, updateSelection, subscribe, signal })`。
仅调用公共 API，通过预览入口开发；A 验收后正式注册，不新建替代公共前端工程。
jobs：输入/选择 JD、提取技能/工具、匹配度、matched/missing、评分解释与降级标记。
diagnosis：选择简历/JD、STAR、JD 定向建议、关键词、Mock/真实状态。
必须处理空选择、错误恢复、长文本、390px、订阅清理、迟到响应；外部内容使用 textContent/value。

## 验证与验收证据

代码交付前至少运行并记录实际结果：

```text
uv sync --locked
uv run --locked pytest -q
uv run --locked pytest tests/jobs tests/diagnosis tests/core -q
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
node scripts/check_frontend.mjs
```

另跑适用的成员/范围自检、jobs/diagnosis 浏览器 smoke，检查 diff、敏感数据、链接和改动范围。
目录未实现或命令失败要明确报告；不建空测试、放宽规则或把跳过写成通过。
公共自检按模块运行：`uv run --locked python -m scripts.check_member jobs` 与
`uv run --locked python -m scripts.check_member diagnosis`。A 已支持 D 双模块范围和新分支 CI；
`check_member --ci` 要求两个模块都存在并有测试。jobs 未实现时应如实报告失败，不削弱规则。
文档/约定交付说明其范围，不能用已有 diagnosis 测试通过宣称新 jobs/embedding 已实现。
共享测试规则由 A 修订，D 在 `D-strict-plan.md` 写具体需求、现状和阻塞命令。

## PR / 最终报告

写明实际功能、关键词公式与 matched/missing、向量是否启用、模型/维度（可标待定）、
pgvector 对 A 的需求、STAR/JD 能力、公共接入、真实/Mock证据、测试、公共文件是否修改及未完成项。
无关本次交付的功能标“未实现/不在本次范围”，不以计划替代成果。
报告当前分支、基线、commit SHA、PR 链接、冲突、测试与 A 待办；不自行 merge。
