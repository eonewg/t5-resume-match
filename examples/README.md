# 最小接入示例

这些文件属于 A 的公共示例目录，不是 B/C/D/E 的业务实现。所有类都显式 `is_mock = True`；即使通过路径配置加载，API 仍显示 Mock。

```powershell
uv sync --locked
uv run python -m scripts.check_member B --examples
uv run python -m scripts.check_member C --examples
uv run python -m scripts.check_member D --examples
uv run python -m scripts.check_member E --examples
```

示例从 [team.json](fixtures/team.json) 读取固定输出，没有真实解析、匹配算法、AI 调用或分析算法。非固定样例返回明确标注的空占位结果，不推断技能或评分。打印 EXAMPLE_CHECK_PASS 只说明示例可接入，不表示成员完成交付。

成员可以参考对应 `providers/*.py` 的类结构，在自己的 `backend/modules/<模块>/public.py` 实现；不要把读取黄金答案作为真实算法。开发替身保留 `is_mock=True`，真实实现完成后删除该标志或设为 False，并通过自己的测试。

## 样例与预期

- `resume` 和 `jobs` 是纯合成数据。明确写出的 Python/SQL/Docker 是基础提取测试；原文、标题、公司不应被解析器改写。
- `match_cases` 给出匹配/缺失技能的预期。`example_score` 仅供固定示例返回；成员分数只要求有限且在 0–100，并自行解释算法，不强制等于示例分数。
- 空技能 JD 的分数策略由 C 说明，必须避免除零，不编造缺失技能。
- E 的这组样例按“包含该技能的岗位数”统计：Python=2、SQL=2、Docker=1；空岗位返回空字典。复杂同义词、薪资和图表口径另行约定。
- D 的文字是固定离线响应，只验证响应结构。真实建议的质量需要人工验收，不能靠等于样例文字判断。

在本地 `.env` 使用如下配置可演示四个入口，正常业务开发只替换自己的配置项；不要提交 `.env`：

```dotenv
T5_RESUME_PROVIDER=examples.providers.resume:ResumeService
T5_JOBS_PROVIDER=examples.providers.jobs:JobsService
T5_DIAGNOSIS_PROVIDER=examples.providers.diagnosis:DiagnosisService
T5_ANALYTICS_PROVIDER=examples.providers.analytics:AnalyticsService
```

详见 [成员开发与交付](../docs/member-development.md)。
