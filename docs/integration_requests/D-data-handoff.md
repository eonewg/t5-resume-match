# A→D 数据交接：JD / Resume / 人工 baseline 数据集

角色/分支：A（feat/core-a）。本文件是数据交接说明，D 的业务实现不在本次范围内。

## 数据位置

| 内容 | 路径 | 格式 |
|---|---|---|
| JD 数据集（30 份：9 real + 21 synthetic） | `data/jd/jd-real.json`、`data/jd/jd-synthetic.json` | JSON 数组 |
| 简历数据集（5 份，全部 synthetic） | `data/resumes/resume-01.json` … `resume-05.json` | JSON 对象 |
| 人工 gap baseline（5 JD × 3 简历 = 15 组） | `data/baselines/gap-baseline.json`（机读）、`gap-baseline.csv`（速览） | JSON + CSV |
| 字段规范、口径、脱敏规则 | `data/README.md` | — |
| 采集日志（来源/请求次数/失败与被拦记录） | `data/collection/collection-log.md` | — |

核心 ID：核心 JD 为 `jd-real-01/03/04/05/09`，核心简历为 `resume-01/02/03`（与 baseline 覆盖一致）。

## 字段与口径（详见 data/README.md）

- `source_type`：JD 为 `real_web` / `course` / `synthetic`；Resume 为 `real_anonymized` / `public` / `course` / `synthetic`。**任何评估与演示都必须按此分层**，不得把 synthetic 说成 real。
- `salary_min/max`：归一月薪 K（千元/月）；`面议`/日薪为 `null`（T5 允许空值）；`·16薪` 类写进 `notes`，不改月薪区间。
- `skills_manual` / `tools_manual`：**人工标注**（A 采样整理），非算法输出。标注保留 JD 原词与无歧义等价词，不做同义词合并——同义归一（MySQL↔SQL、FineBI↔BI 工具）正是 D 解析/匹配环节需要处理的对象。泛化描述（如"熟悉常用存储系统和中间件"）不拆词，仅存于 `raw_text`。
- 简历 `anonymized: true` 才可用；脱敏规则见 README（删除直接标识 + 学校/公司/竞赛泛化）。
- baseline 中所有 `_manual` 字段与 `reviewer: manual(A)` 标记表示**人工判断**，不是系统算法结果，不得当作 ground truth 之外的任何用途，更不得回写为系统输出。

## D 应优先用这些数据验证的内容

按 T5 验收顺序：

1. **JD parsing / skills·tools extraction**：对 9 份 real JD（尤其 jd-real-06~09 的转写压缩版）与 21 份 synthetic JD 跑解析，对比系统输出与 `skills_manual/tools_manual` 的一致率；泛化描述（jd-real-04 的存储系统）应能"不确定"而不是硬拆。
2. **Keyword matching / matched skills / missing skills**：对 15 组 baseline 计算系统 matched/missing，与 `matched_skills_manual/missing_skills_manual` 对照，观察同义词场景（baseline-08 的 MySQL↔存储系统、baseline-13 的指标看板↔指标体系、baseline-14 的 MySQL↔SQL）。
3. **Score consistency**：0–100 分数与 matched/missing 数量、`match_level_manual`（low 10 / medium 4 / high 1）的相对排序是否一致；解释文案应能引用具体命中/缺失词。
4. **Diagnosis（Level 2）**：对 baseline 中含表达 gap 的组（12/15 组有 `expression_gaps_manual`）验证 STAR 与 JD 定向优化：
   - 缺量化场景（组 01/03/05/08/13）应提示补充量化，而不是生成数字；
   - 同义词不命中场景（组 08/13/14）应给出关键词强化建议；
   - low 组（如组 04/06）应如实提示能力差距与学习方向，不粉饰。
5. **Embedding/pgvector 需求回传**：向量化的对象、模型、维度、距离方式由 D 明确后按集成请求提出，A 在公共库实现。当前数据层**未预置任何向量维度**。

## 使用约束

- 不修改 `data/` 下已发布文件的字段语义；确需新增字段时在 `docs/integration_requests/` 提交集成请求，A 在公共层实现。
- 数据缺口的现状（真实简历 0 份、大数据/数据科学方向真实 JD 0 份）记录在 `data/README.md` 末尾与 `data/collection/collection-log.md`，D 的报告/演示引用数据时同样需要标注样本构成。
- 校验命令：`uv run python scripts/validate_data.py`（提交前必须通过）。

## A 处理记录

数据集、规范、baseline 与本文档由 A 于 2026-09-07 建（commit 见验收台账）；D 使用中发现口径问题的，回写本文件或在集成请求中提出。
