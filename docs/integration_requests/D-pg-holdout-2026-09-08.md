# D：真实 PostgreSQL + 模型 holdout 验收

PostgreSQL 17.6；pgvector 0.8.1；空间 `t5-clauses-21680062d52141defa7076a845559b33f8a0a5bc1f563655`。
模型 `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2@e8f8c211226b894fcb81acc59f3b34ba3efd5f42|t5-clauses-v2`，384 维 cosine，固定 0.8 keyword + 0.2 semantic，默认 off。
使用 A 原始 5 JD × 3 简历；简历采用 A 自动解析输出，未经人工确认，未构造金标准。
此批已在此前暴露长度问题；本次是固定算法的集成回归，不是新的独立盲测/生产准确率。

| 文档 | 完整片段数 | source_hash |
| --- | --- | --- |
| holdout-jd-01 | 121 | 9e11a1882102cf101c1d12abfdae547532c5bdf6041de649eaa38d44d62cdc47 |
| holdout-jd-02 | 100 | 2c9f671b50ea9a576b8d12bf06c183ad96288f14977294cf6f59e76af9106bb8 |
| holdout-jd-03 | 113 | 215ab61d95ff46efef2be62bb0b2b9a6c80aad1ec58924e56ef000160e937358 |
| holdout-jd-04 | 88 | 5afedf97a9a7c76ff47042ce0cf6fc6a41d7c09fa2c081362d065f5f4f648ba7 |
| holdout-jd-05 | 154 | deca6cdef388a9e562b6879e3e7910ae62204b80c2131c9ff8af1611393b5829 |
| student-01 | 35 | 72b07cbdd6564859f14392aaeb2d0151f0afdd4a4041f9360c296cb53dcfc56d |
| student-02 | 28 | e2be980cadf8f1e5c43f0dc5a12a6a08d28548cc4df2f40e3299e5106e8b127f |
| student-03 | 0 | empty |

| JD | Resume | keyword | semantic（内存） | final 内存 | final PG miss | final PG hit | 状态 | miss 编码批次 | semantic 差值 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| holdout-jd-01 | student-01 | 0.00000000 | 36.69849713 | 7.34000000 | 7.34000000 | 7.34000000 | semantic | 11 | 0.00000005 |
| holdout-jd-01 | student-02 | 28.57000000 | 36.25160202 | 30.11000000 | 30.11000000 | 30.11000000 | semantic | 10 | 0.00000003 |
| holdout-jd-01 | student-03 | 0.00000000 | None | 0.00000000 | 0.00000000 | 0.00000000 | empty | 0 | 0.00000000 |
| holdout-jd-02 | student-01 | 0.00000000 | 33.95105895 | 6.79000000 | 6.79000000 | 6.79000000 | semantic | 10 | 0.00000021 |
| holdout-jd-02 | student-02 | 33.33000000 | 35.26851017 | 33.72000000 | 33.72000000 | 33.72000000 | semantic | 9 | 0.00000001 |
| holdout-jd-02 | student-03 | 0.00000000 | None | 0.00000000 | 0.00000000 | 0.00000000 | empty | 0 | 0.00000000 |
| holdout-jd-03 | student-01 | 0.00000000 | 35.40355103 | 7.08000000 | 7.08000000 | 7.08000000 | semantic | 11 | 0.00000006 |
| holdout-jd-03 | student-02 | 50.00000000 | 34.44865401 | 46.89000000 | 46.89000000 | 46.89000000 | semantic | 10 | 0.00000003 |
| holdout-jd-03 | student-03 | 0.00000000 | None | 0.00000000 | 0.00000000 | 0.00000000 | empty | 0 | 0.00000000 |
| holdout-jd-04 | student-01 | 0.00000000 | 35.75467778 | 7.15000000 | 7.15000000 | 7.15000000 | semantic | 9 | 0.00000002 |
| holdout-jd-04 | student-02 | 25.00000000 | 35.78854311 | 27.16000000 | 27.16000000 | 27.16000000 | semantic | 8 | 0.00000010 |
| holdout-jd-04 | student-03 | 0.00000000 | None | 0.00000000 | 0.00000000 | 0.00000000 | empty | 0 | 0.00000000 |
| holdout-jd-05 | student-01 | 0.00000000 | 35.56255745 | 7.11000000 | 7.11000000 | 7.11000000 | semantic | 13 | 0.00000001 |
| holdout-jd-05 | student-02 | 0.00000000 | 35.02604992 | 7.01000000 | 7.01000000 | 7.01000000 | semantic | 12 | 0.00000011 |
| holdout-jd-05 | student-03 | 0.00000000 | None | 0.00000000 | 0.00000000 | 0.00000000 | empty | 0 | 0.00000000 |

每组强制公共整组清空后 miss，再独立事务 hit；hit 编码调用均为 0。miss/hit semantic 与 final 完全相等，内存差值限制 1e-4 分（float32/批次浮点误差）；final 两位小数跨舍入边界最多 0.01。
所有结构化 matched/missing 保持一致。student-03 自动解析无有效 skills/experience，保留 empty/keyword 降级；未从 raw_text 擅自恢复技能。
HTTP Resume preview → 保存 → JD parse/save → Vector cache → Matching → MatchRecord 已实际执行；测试数据在独立随机 schema 内，由 A 测试 fixture 清理。
仍有限制：同一雇主、历史学生简历、自动解析遗漏、过滤误伤及薪资/非技术上下文噪声，不能以分数变化声称质量改善。默认 off。
