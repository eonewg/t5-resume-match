# D：2026-09-08 真实 holdout 执行记录

固定 A 的 5 JD × 3 公开历史学生简历，未裁剪/翻译原文、未调词表、权重或预算。
简历采用 A 当前 ResumeService 的自动解析结果，尚无人确认及独立人工金标准，不能报告准确率/录用排序质量。
真实本地模型两条探针已执行成功；完整文档是否成功单独记录。

空间：`t5-clauses-21680062d52141defa7076a845559b33f8a0a5bc1f563655`；model：`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2@e8f8c211226b894fcb81acc59f3b34ba3efd5f42|t5-clauses-v2`；384 维 cosine。

## JD 解析

| ID | skills / tools 数 | salary |
| --- | --- | --- |
| holdout-jd-01 | 7 / 7 | null |
| holdout-jd-02 | 3 / 3 | null |
| holdout-jd-03 | 4 / 4 | null |
| holdout-jd-04 | 4 / 4 | null |
| holdout-jd-05 | 5 / 5 | null |

## 输入与预算

| ID | 结构化技能 / 经历条数 | 片段数 / source_hash |
| --- | --- | --- |
| holdout-jd-01 | 7 / — | 超过现有 32 片段预算；不截断以制造成功 |
| holdout-jd-02 | 3 / — | 超过现有 32 片段预算；不截断以制造成功 |
| holdout-jd-03 | 4 / — | 超过现有 32 片段预算；不截断以制造成功 |
| holdout-jd-04 | 4 / — | 超过现有 32 片段预算；不截断以制造成功 |
| holdout-jd-05 | 5 / — | 超过现有 32 片段预算；不截断以制造成功 |
| student-01 | 2 / 14 | 超过现有 32 片段预算；不截断以制造成功 |
| student-02 | 3 / 9 | 28 / e2be980cadf8f1e5c43f0dc5a12a6a08d28548cc4df2f40e3299e5106e8b127f |
| student-03 | 0 / 0 | 0 / 无有效输入 |

## 相同输入 15 配对

| JD | Resume | keyword | 内存增强结果 | semantic | 状态 | pgvector 缓存 |
| --- | --- | --- | --- | --- | --- | --- |
| holdout-jd-01 | student-01 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-01 | student-02 | 28.57 | 28.57 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-01 | student-03 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-02 | student-01 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-02 | student-02 | 33.33 | 33.33 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-02 | student-03 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-03 | student-01 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-03 | student-02 | 50.0 | 50.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-03 | student-03 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-04 | student-01 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-04 | student-02 | 25.0 | 25.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-04 | student-03 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-05 | student-01 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-05 | student-02 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |
| holdout-jd-05 | student-03 | 0.0 | 0.0 | None | unavailable | 未执行：公共片段读写契约缺失 |

缓存首次生成、再次命中、输入变化重新生成、跨空间隔离均未完成真实数据库验收。
哈希/空间隔离单元测试不等于持久化缓存验收；不得将本表 keyword fallback 标为 embedding 成功。
下一步需 A 片段读取/写入与 session 注入契约；长 JD 预算问题另行设计后再用新样本复验。默认保持 off。
