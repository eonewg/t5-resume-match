# 五份真实 JD 的样本分析

2026-09-08，A 产品阶段。通过产品“导入 5 份真实 JD 快照”写入真实 PostgreSQL，再读取 `GET /api/v1/analytics?source_type=real`。分析来自已保存的结构化 JD；没有联网刷新职位状态，也没有调整 D 关键词算法。原始快照与来源哈希见 [材料说明](../data/holdout/2026-09-08/README.md)。

## 样本与来源

样本量 5 条，已知雇主 1 家（Canonical），采集日期均为 2026-09-08。全部标记为 real，五个不同来源链接；课程/合成/未确认来源记录不在此筛选中。固定导入重复执行为新增 0、已有 5，不增加频率分母。

| 岗位 | 已保存的技能/工具关键词 | 来源 |
| --- | --- | --- |
| Graduate Software Engineer, Open Source and Linux | C++、Go、Java、JavaScript、Kubernetes、Linux、Python | [Canonical 8142329](https://job-boards.greenhouse.io/canonical/jobs/8142329) |
| Junior Linux Kernel Engineer - Ubuntu | Git、Linux、Python | [Canonical 5370815](https://job-boards.greenhouse.io/canonical/jobs/5370815) |
| Junior Ubuntu Software Engineer | C++、Go、Linux、Python | [Canonical 6707669](https://job-boards.greenhouse.io/canonical/jobs/6707669) |
| Distributed Systems Testing Software Engineer, Python / Go | Go、Kubernetes、Linux、Python | [Canonical 2969042](https://job-boards.greenhouse.io/canonical/jobs/2969042) |
| Junior Product Manager | Docker、Excel、Go、Kubernetes、Linux | [Canonical 6980706](https://job-boards.greenhouse.io/canonical/jobs/6980706) |

## 技能频率

每条 JD 的同一关键词只计一次，tools 不额外加权；比例分母为全部 5 条 JD，不是所有关键词数量。词云与条形图共用以下数据，逐岗要求并不互斥。

| 关键词 | JD 数 | 样本内占比 |
| --- | --- | --- |
| Linux | 5 | 100% |
| Go | 4 | 80% |
| Python | 4 | 80% |
| Kubernetes | 3 | 60% |
| C++ | 2 | 40% |
| Docker | 1 | 20% |
| Excel | 1 | 20% |
| Git | 1 | 20% |
| Java | 1 | 20% |
| JavaScript | 1 | 20% |

这些是 D 规则解析后的字段出现频率，不是独立人工标注的必选技能，也不能区分每个词属于公司技术栈、任选或硬性要求。对目标岗位逐项阅读原文，再以真实经历确认对应技能；不能根据频率把缺失技能写入简历。

## 薪资

5/5 条缺少完整薪资区间，comparable=0、missing_range=5、missing_unit=0；没有薪资分组或平均薪资。福利中的 USD 2,000 学习预算未作为薪资。unknown 保留在样本量与技能统计中，但不以零进入薪资图。

图表功能另以明确标记 synthetic 的 CNY/year、USD/month、EUR/hour 和单位缺失记录验证。每组独立刻度，缺单位记录单列；这些测试数字不属于本报告的真实市场数据。

## 可解释的结论与限制

在这五份特定快照中，Linux 最普遍，Go/Python 次之，可为阅读相关目标岗位和整理实际技能证据提供顺序。仅有一家开源软件雇主，且为英文描述；不能据此声称整体市场热门度、薪资水平或增长趋势。采集日期不等于发布日期，不能声称岗位当前仍有效。

后续应补充不同雇主、地区和岗位，以及确有完整币种/周期的真实薪资披露；质量验收需要独立人工确认。当前结果完成课程样本的可追溯描述性分析，不替代这些后续材料。
