# 关键词样本验证

固定词表规则，未训练/调用 embedding 或 AI。
领域词表参考本批 JD 人工技能标注；本报告是样本内观察，不是独立留出评测。运行时不读取样本 ID、人工匹配分数或 baseline。
30 个 JD（9 real_web、21 synthetic）、10 份 synthetic 简历；真实学生简历为 0。
人工标注用于对照，不是系统输出。词表覆盖及标注口径差异影响结果，不作为市场结论。

## JD 提取与人工关键词并集对照

| JD | 系统关键词数 | 人工关键词数 | 共同关键词数 |
| --- | --- | --- | --- |
| jd-real-01 | 10 | 10 | 9 |
| jd-real-02 | 5 | 6 | 5 |
| jd-real-03 | 15 | 14 | 14 |
| jd-real-04 | 7 | 9 | 7 |
| jd-real-05 | 7 | 8 | 5 |
| jd-real-06 | 4 | 5 | 4 |
| jd-real-07 | 4 | 5 | 4 |
| jd-real-08 | 2 | 3 | 2 |
| jd-real-09 | 3 | 4 | 2 |
| jd-syn-01 | 11 | 12 | 10 |
| jd-syn-02 | 12 | 11 | 9 |
| jd-syn-03 | 7 | 7 | 7 |
| jd-syn-04 | 5 | 8 | 4 |
| jd-syn-05 | 9 | 12 | 9 |
| jd-syn-06 | 5 | 8 | 5 |
| jd-syn-07 | 9 | 9 | 9 |
| jd-syn-08 | 13 | 12 | 11 |
| jd-syn-09 | 9 | 9 | 9 |
| jd-syn-10 | 8 | 8 | 7 |
| jd-syn-11 | 8 | 10 | 8 |
| jd-syn-12 | 13 | 13 | 12 |
| jd-syn-13 | 9 | 9 | 9 |
| jd-syn-14 | 9 | 12 | 9 |
| jd-syn-15 | 9 | 10 | 9 |
| jd-syn-16 | 12 | 14 | 12 |
| jd-syn-17 | 11 | 9 | 9 |
| jd-syn-18 | 9 | 9 | 9 |
| jd-syn-19 | 9 | 9 | 8 |
| jd-syn-20 | 7 | 8 | 6 |
| jd-syn-21 | 7 | 7 | 6 |

## 两轮 40 组匹配

使用简历已提供的 skills（不从课程/原文推断掌握技能）。人工档位结合语义与经历，
本算法只计字面关键词覆盖，两者不要求一致。MySQL 不自动算 SQL；不把相关概念当等价。

| pair | 关键词分 | 已匹配数 | 缺失数 | 人工档位 |
| --- | --- | --- | --- | --- |
| baseline-r2-01 | 10 | 1 | 9 | low |
| baseline-r2-02 | 0 | 0 | 7 | low |
| baseline-r2-03 | 0 | 0 | 7 | medium |
| baseline-r2-04 | 0 | 0 | 4 | medium |
| baseline-r2-05 | 66.67 | 2 | 1 | high |
| baseline-r2-06 | 10 | 1 | 9 | low |
| baseline-r2-07 | 0 | 0 | 7 | medium |
| baseline-r2-08 | 0 | 0 | 7 | low |
| baseline-r2-09 | 0 | 0 | 4 | low |
| baseline-r2-10 | 0 | 0 | 3 | low |
| baseline-r2-11 | 30 | 3 | 7 | medium |
| baseline-r2-12 | 0 | 0 | 7 | low |
| baseline-r2-13 | 0 | 0 | 7 | medium |
| baseline-r2-14 | 0 | 0 | 4 | low |
| baseline-r2-15 | 66.67 | 2 | 1 | low |
| baseline-r2-16 | 0 | 0 | 10 | low |
| baseline-r2-17 | 0 | 0 | 7 | low |
| baseline-r2-18 | 0 | 0 | 7 | low |
| baseline-r2-19 | 0 | 0 | 4 | low |
| baseline-r2-20 | 33.33 | 1 | 2 | low |
| baseline-r2-21 | 0 | 0 | 10 | low |
| baseline-r2-22 | 0 | 0 | 7 | low |
| baseline-r2-23 | 0 | 0 | 7 | low |
| baseline-r2-24 | 0 | 0 | 4 | low |
| baseline-r2-25 | 0 | 0 | 3 | low |
| baseline-01 | 10 | 1 | 9 | low |
| baseline-02 | 10 | 1 | 9 | low |
| baseline-03 | 30 | 3 | 7 | medium |
| baseline-04 | 6.67 | 1 | 14 | low |
| baseline-05 | 20 | 3 | 12 | medium |
| baseline-06 | 0 | 0 | 15 | low |
| baseline-07 | 0 | 0 | 7 | low |
| baseline-08 | 0 | 0 | 7 | medium |
| baseline-09 | 0 | 0 | 7 | low |
| baseline-10 | 0 | 0 | 7 | low |
| baseline-11 | 0 | 0 | 7 | low |
| baseline-12 | 0 | 0 | 7 | medium |
| baseline-13 | 66.67 | 2 | 1 | high |
| baseline-14 | 0 | 0 | 3 | low |
| baseline-15 | 33.33 | 1 | 2 | low |

局限：固定词表不覆盖全部泛化能力、同义语义或逻辑选择要求；
“至少一种”仍按显式关键词等权计数；该分数不是岗位适任性或录用概率。
这些差异应由样本审查指导下一阶段，不从人工 baseline 直接生成固定输出。
