# D：Embedding / pgvector 核心集成验收

2026-09-08；head feat/intelligence-d → base feat/core-a；A 基线 `adfcc33e3854ef7cfddab8e1f59c93d8d66db05a`，合并提交 `99d327c`。仅 D 的 public.py 有文本冲突，保留 D 的过滤/薪资解析并接入 A 公共 tools；公共数据库、schema、迁移、Context 和 VectorRepository 均以 A 为准。

## 行为与接入

保留关键词基线、否定/学习意向过滤、STAR/JD 诊断事实边界及既有 Jobs 前端。新增真实 `match_with_context`：通过公共 context.vector_repository() 读取完整片段组，miss 批量编码后 replace，hit 直接复用；先 Resume 后 JD。D 不创建 Session、不 commit/rollback、不访问向量表、不跨请求保存上下文。保存点失败后在 with 外降级；SQLite 的 None 走内存路径。

模型 paraphrase-multilingual-MiniLM-L12-v2，revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`，384 维 cosine，预处理 t5-clauses-v2，空间 ID `t5-clauses-21680062d52141defa7076a845559b33f8a0a5bc1f563655`。source_hash 对真实有序输入数组的无空格 UTF-8 JSON 做 SHA-256，完整身份与空间设计见 [设计记录](https://github.com/eonewg/t5-resume-match/blob/feat/intelligence-d/docs/integration_requests/D-fragment-cache-design.md)。

长文档保持原过滤和 80 字符片段，完整处理最多 512 片段/文档、16 条/批、64 批/匹配；每片段检查 128 token。超限不截断，明确降级。逐 JD 片段最大非负 cosine 均值仍为 semantic；final=0.8 keyword+0.2 semantic，matched/missing 仍为关键词事实。默认仍 off。

## 实测结果

- PostgreSQL **17.6** + pgvector **0.8.1**，本轮在当前电脑重新安装/编译并实际运行，非引用 A 的历史成绩。
- 全量 Python **247 passed，0 skipped，0 failed**，含 Jobs **112**、Diagnosis **44**、core **74**、Resume **17**。两条现有依赖 deprecation warnings，不影响结果。
- 真实库测试涵盖：首次 miss/第二次 hit 不编码、只重算 hash 变化的文档、预处理/revision 新空间、真实 SQL 错误保存点回滚后内存恢复、模型也不可用时 keyword 恢复、workflow 后续失败时 MatchRecord 和缓存全部回滚。A 的有序组替换/重连读取/cascade/并发/距离/HNSW 测试同时通过。
- 全仓 Ruff check、format check（78 文件）通过；统一前端 33 项通过；jobs/diagnosis 成员自检与 D scope 检查通过。未删除/跳过或降低公共测试规则。
- A PostgreSQL smoke：扩展、迁移、HNSW、upsert/query、Resume → JD → keyword matching 通过。
- 真实 Edge + 本地模型 + PostgreSQL：公开 Jobs 页面首次 miss、再次 hit、技能/薪资、组合分/gap、失败重试、Mock 标签、390px、XSS/长文本、导航清理、否定/学习意向通过。截图本地 Temp/t5-jobs-desktop.png 与 t5-jobs-mobile.png。
- 默认测试使用确定性替身，不调用收费接口。真实模型仅在显式验收环境运行；Diagnosis 的 Mock/真实区分未改，真实 AI 质量不在本次验收结论内。

## 15 配对

完整明细见 [真实 holdout 记录](https://github.com/eonewg/t5-resume-match/blob/feat/intelligence-d/docs/integration_requests/D-pg-holdout-2026-09-08.md)。5 份 JD 完整保留 121/100/113/88/154 个片段；前两份简历为 35/28 个片段。

10 个有效配对真正执行 semantic，5 个 student-03 配对因 A 自动解析无有效 skills/experience 明确 empty/keyword 降级。每个有效配对强制公共清空后 miss，再独立事务 hit；hit 模型调用为 0。miss/hit 的 semantic 和 final 完全相等；内存与数据库语义分最大差约 **0.00000021** 分，所有 final 相等，没有舍入差。

公开 HTTP 的 Resume preview → 保存 → JD parse/save → Vector cache → Matching/MatchRecord 链路也实际通过。测试 schema 随 A fixture 清理；没有改写原 holdout 文件，没有用本批调权重或过滤规则。

## 运行与边界

本机运行资源位于 ignored `.verification/postgres`；Windows PostgreSQL 在中文安装路径出现初始化编码错误，使用 ASCII junction `C:/Users/Public/t5-d-postgres-20260908` 指向该目录后成功。通过原 A 脚本 `scripts/local_postgres.ps1 -Action Start/Connect -RuntimeRoot C:/Users/Public/t5-d-postgres-20260908` 配置当前进程数据库环境，密码不输出、不提交。未改公共脚本或根依赖。

真实 holdout 命令：在已 Connect 的终端设 PYTHONPATH=.、PYTHONUTF8=1、OMP_NUM_THREADS=2、HF_HUB_OFFLINE=1，执行 `uv run --offline --locked --with sentence-transformers==5.1.0 --with torch==2.8.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu python tests/jobs/evaluate_pg_holdout.py`。模型须已缓存；脚本不会伪造 PostgreSQL 或模型成功。

本阶段核心缓存集成通过，**不建议默认开启**：无独立人工金标准、单一雇主/历史简历偏差、student-03 解析遗漏及已知过滤误伤/非技能上下文噪声仍在。当前材料曾暴露预算问题，因此这次是集成回归，不是新的独立盲测，更不是生产准确率。

A 无新增公共接口阻塞。后续由 A 审查合并及组织人工确认的效果验收；D 保持可选模式，未修改 A 公共实现、Resume、Analytics、导航、依赖或 CI。PR 仍为 #6，不新建、不自动合并。
