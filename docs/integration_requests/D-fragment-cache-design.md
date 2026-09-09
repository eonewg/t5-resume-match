# D：公共片段缓存与长文档算法

基线 A `adfcc33e3854ef7cfddab8e1f59c93d8d66db05a`。公共 FragmentSetWrite/FragmentVector/get_fragments/replace_fragments 与 MatchContext 已提供，取代此前 D-vector-fragment-port 的“接口缺失”状态。默认 T5_JOBS_EMBEDDING=off。

## 事务接入

JobsService.match_with_context(resume, jd, context) 是公开同步入口；无 context 的 match 仍支持内存路径。
每次调用只在 `with context.vector_repository() as vectors` 内使用 repository；不新建 Session、不 commit/rollback、不保存 context/repository 到共享实例。SQLite 的 None 走原路径；关闭增强时不访问缓存。

有有效片段时 register_space 验证完整身份，按 Resume → JD 顺序读取/写入，遵守 A 的源行加锁顺序。每份文档：

1. 对完整有序输入算 hash，get_fragments(space, kind, document_id, source_hash)。
2. 命中校验数量、连续 index、kind/文档 ID/hash/space、384 维有限非零向量，直接复用 values，不调用模型。
3. miss 编码完整输入，replace_fragments 原子替换整组，再使用返回的 float32 values 评分。不会直接读写表，不使用 nearest/ANN。
4. 数据库/模型/校验异常从 with 内向外传播，A 回滚保存点后 D 才捕获并执行内存 semantic；模型仍不可用则 keyword fallback。异常内容不泄露到 gap_analysis。数据库断连等不能恢复外层事务的情况仍由 A 返回错误，不能承诺所有数据库故障都可保存结果。
5. 保存点成功不是 commit；workflow 后续失败时缓存随 A 的外层事务回滚。

## 身份与哈希

- 模型 sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2。
- revision e8f8c211226b894fcb81acc59f3b34ba3efd5f42；384 维 cosine；预处理 t5-clauses-v2。
- space model 完整值 `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2@e8f8c211226b894fcb81acc59f3b34ba3efd5f42|t5-clauses-v2`。
- ID `t5-clauses-21680062d52141defa7076a845559b33f8a0a5bc1f563655`：对 `model@revision|preprocessing|cosine|384` UTF-8 SHA-256 取前 48 位，加 t5-clauses- 前缀。模型、revision、预处理任一变化生成新 ID；注册/读取仍比较完整空间，不只信任摘要。
- source_hash = SHA256(UTF-8(json.dumps(完整有序片段数组, ensure_ascii=False, separators=(",", ":"))))。无 BOM，无尾换行；哈希时不再次 normalize。顺序、内容和边界改变都会失效；只改被过滤内容而实际输入不变，可复用。
- JD 输入是原文经冻结过滤及 chunks 的结果；Resume 输入是已确认 experience + skills，经同样过滤及 chunks。空片段不写空缓存，也不擅自从 raw_text 补技能。

## 长文档与资源预算

原 t5-clauses-v2 过滤、NFKC、空白折叠、句界、80 字符窗口、有序去重全部不变，只扩展接受完整文档的资源预算和执行调度。既有可接受短输入的实际文本与空间不变；超长原来没有缓存，因此不需要为相同向量改预处理版本。

- 每份文档最多 512 完整片段，两份合计最多 1024。超过上限则整次增强明确降级，不截取前 32/512 条冒充完整覆盖。
- encode_batches 每批最多 16，缓存路径每文档最多 32 批、一次匹配最多 64 批。缓存异常后最多再做一次完整内存尝试，因此最坏 128 批；不做无限重试。
- LocalMiniLM 每批用固定模型 tokenizer、truncation=False 检查所有片段（包含 special tokens）不超过 128 token；任一超限拒绝增强，不默默截 token。
- 不依赖 A 的根依赖变化：本地模型需预先安装/下载，运行时不下载、不上传简历、不用收费 API。
- cosine 逐个 JD 片段扫描 Resume 片段，只保留每个 JD 的最大值及首个并列证据；不构建全库 ANN 或整个相似度矩阵。最大 512² 个片段对，每对 384 维。
- 语义分仍为 100 × mean(max(0, max_resume cosine))；final 仍为 round((1-weight) keyword + weight semantic, 2)，默认 weight=0.2，可配 0–0.5。matched/missing 和关键词事实不被语义补写。
- miss 使用 replace 返回的 float32，hit 使用同一持久化 float32；两者应相等。相对于内存模型浮点结果，semantic 验收容差 1e-4 分，最终分跨两位小数舍入边界允许最多 0.01，并报告实际差值。

## 验证入口

离线：tests/jobs/test_vector_cache.py（合同替身，非真实模型）。
真实 PostgreSQL：tests/jobs/test_cache_postgres.py（复用 A 随机隔离 schema；生产 D 模块无 SQL/Session 代码）。包含实际 API 缓存命中、输入变化、跨版本隔离、SQL 错误保存点恢复、workflow 后续失败回滚。版本隔离使用明确测试替身，不声称运行不存在的新模型 revision。
真实模型 + PostgreSQL：tests/jobs/evaluate_pg_holdout.py，公开 5×3 数据的完整输入，分别比较 keyword/memory/miss/hit，并验证真实 HTTP hook。结果另记 D-pg-holdout-2026-09-08.md。

以前 D-real-holdout-2026-09-08 / D-vector-jd-validation 是当时失败的历史记录，保留以说明修复前状态，不再代表当前接口能力。不存在人工金标准；这批已暴露预算问题，此次只宣称固定算法的集成回归，不虚构生产准确率。
