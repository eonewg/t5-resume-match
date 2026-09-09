# 最终市场补充样本

2026-09-08 实际读取五个招聘方的 Greenhouse 公开页面，整理来源摘要与薪资证据。`samples.json` 的 `jd_text` 是明确标记的中文摘要，**不是完整 JD 原文，也不是合成岗位**；来源链接、采集日期、岗位与薪资逐项保留。摘要可能遗漏非技术条件，不用作完整 JD 解析召回率金标准。

| 岗位来源 | 岗位层级/地区 | 薪资上下界 | 币种/周期 |
| --- | --- | --- | --- |
| [The New York Times](https://job-boards.greenhouse.io/thenewyorktimes/jobs/4724948005) | 2 年以上，纽约混合办公 | 110,000–130,000 | USD/year |
| [Sage](https://job-boards.greenhouse.io/sage49/jobs/6152678004) | Senior/Staff，纽约 | 190,000–245,000 | USD/year |
| [Anthropic](https://job-boards.greenhouse.io/anthropic/jobs/5400153008) | 6 年以上，业务技术 | 320,000–405,000 | USD/year |
| [Scopely](https://job-boards.greenhouse.io/scopely/jobs/5301857008) | 2 年以上，特定美国州 | 91,300–140,000 | USD/year |
| [Scale AI](https://job-boards.greenhouse.io/scaleai/jobs/4730836005) | 2026/2027 应届，旧金山 | 124,000–162,000 | USD/unknown |

Scale 页面所读取的薪资段只说明 base salary，没有明确周期，保留 null。不会因为数量级像年薪就补 year。其他四条来自明确的 annual 表述；奖金、股权与福利不额外加到区间。

与之前五份 Canonical 快照合计 10 条真实来源记录、6 家雇主：4 条可比较 USD 年薪，5 条缺区间，1 条缺周期。资历与地区差异很大，图中展示原区间，不计算“应届生平均薪资”，不把其中的资深岗位当作学生投递建议。

校验：`uv run --locked python -m scripts.import_final_samples`。显式写入当前数据库：增加 `--apply`，脚本通过现有 Jobs provider 解析并保留已确认的薪资与来源；固定记录 ID 可重复执行，已有记录不被覆盖。不自动修改默认五份快照导入按钮。
