# Jobs / 关键词匹配（D）

默认 Level 1 关键词匹配；可选本地 Embedding 增强见
[Level 2 方案和公共请求](../../../docs/integration_requests/D-embedding-contract.md)。公共接口接入及 Level 1 验收见
[D 集成记录](../../../docs/integration_requests/D-jobs-integration.md)。

## 接入

设置 `T5_JOBS_PROVIDER=backend.modules.jobs.public:JobsService`，由现有公共加载器构造无参实例。
同步入口 `parse(JDInput) -> JDData`、`match(Resume, JD) -> MatchResult`。
使用已有 `/api/v1/jobs`、`/api/v1/resumes`、`/api/v1/matches`；保存和 ID 分配由公共层负责。
前端导出公共 `mount(container, context)`，可用 `/?preview=jobs#jobs` 预览；默认导航注册仍需 A。

`parse` 根据原文字面命中技能及工具；公共 `skills` 暂承载两类关键词并集。
内部 `parse_detail` 保留原文并分离 `skills`/`tools`，没有新增公共 schema。
输入已通过公共 schema 时保留所接收文本；HTTP 层已有的首尾空白规范化不由 D 改写。
岗位名/公司由输入提供，不推断薪资、学历或经历。

## 独立基线

将双方结构化 skills 做 NFKC、大小写及明确别名归一化后去重，得到 JD 集合 J 和简历集合 R。
`score = round(100 * |J ∩ R| / |J|, 2)`；所有技能/工具等权。
`matched_skills = J ∩ R`，`missing_skills = J - R`，排序稳定；`gap_analysis` 给出分子、分母、缺失数和局限。
J 为空时分数为契约占位值 0，说明无法有效评估，页面不显示数字评分。
MySQL 不隐含 SQL；原文不反向覆盖用户编辑过的结构化技能，避免重新加回删除的要求。

固定词表提供可解释的有限覆盖，处理 ASCII 词边界、最长别名及部分紧邻否定表达。
不承诺理解复杂否定、任选关系或全部同义词；“至少一种”仍按关键词等权计数。
`domain_terms.json` 参考当前 JD 人工技能标注补充领域词；运行时不读样本、ID、人工匹配结果。
[30 JD / 40 配对报告](../../../docs/integration_requests/D-keyword-evaluation.md) 为样本内观察，不能充当独立评测。

## 模式与验证

规则服务 `is_mock=False` 表示真实规则计算，不表示真实 AI；上游 Mock 来源由公共层传播，页面明确标识。
关键词请求失败显示错误与重试，不回退伪装成功。可选 embedding 不可用则保留关键词结果并明确标注语义降级。
没有 API Key、收费网络调用或向量数据库依赖。默认关闭语义增强时结果与 Level 1 完全相同。

```powershell
uv run --locked pytest tests/jobs -q
uv run --locked python -m scripts.check_member jobs
node scripts/check_frontend.mjs
$env:PYTHONPATH='.'
uv run --locked python tests/jobs/evaluate_samples.py
```

浏览器验收使用独立的内存 SQLite 测试服务（不操作真实业务库）：

```powershell
$env:T5_DATABASE_URL='sqlite://'
$env:T5_JOBS_PROVIDER='backend.modules.jobs.public:JobsService'
uv run --locked uvicorn backend.main:app --host 127.0.0.1 --port 8768
# 另一终端，需本机 Playwright 可用且已安装 Edge；不新增仓库根依赖
node tests/jobs/browser-smoke.cjs
```

浏览器脚本会创建合成记录，验证桌面/390px、失败重试、Mock、注入文本及反复导航清理。
