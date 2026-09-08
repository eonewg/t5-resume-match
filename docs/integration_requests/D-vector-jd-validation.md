# D：JD 字段接入与 Vector 缓存集成检查（ADAPT）

2026-09-08，head feat/intelligence-d，base feat/core-a。已 merge A `e3d1c16ae4f55b67f43f96291dfc62bcaa010286`，merge 提交 `f382b82`。
无 Git 文本冲突；自动合并使 D 测试出现重复 resume_provider 参数，已仅在 tests/jobs/test_jobs.py 去重。未覆盖 A 的公共代码。

## 已交付

- 保留现有关键词基线和可选语义匹配、否定/意向过滤，未改变评分公式或默认 off。
- JD parse 返回公共 tools；skills 仍为技能/工具并集，不改变关键词分母。薪资识别带明确标签的单一区间，支持 K/万单位、部分明确币种和 hour/day/month/year 周期；只展开单位，不跨币种/周期换算。
- 薪资叙述、福利预算、多地区多区间、负数、百分比等不猜测；未支持的格式（包括单一固定金额）仍留空，需用户确认。裸 $ 不推断 USD，未知币种/周期独立为 null。5 份真实 JD 均未误提取 USD 2,000 学习预算为薪资。
- 公共 HTTP 层的用户显式字段覆盖保持不变，新增 API 读回测试覆盖 skills/tools 空值以及薪资显式覆盖。Jobs 前端显示 tools、薪资原文、范围和未知口径，用 textContent 防注入。
- `vector_plan.py` 固定公共 VectorSpace 身份和精确输入 source_hash。它只是接入准备，不是数据库缓存实现。

## 仍然阻塞

详见 [D-vector-fragment-port.md](D-vector-fragment-port.md)。现有 VectorRepository 只能写每篇文档一个向量、查询 ID/hash/distance，缺少读取 values、多片段原子写入和 Jobs 事务注入契约。不能完成现有片段 pair scoring 的缓存复用，不能用 nearest 或整篇均值冒充。

不新建公共表、迁移、vector 列或索引，不直接查询 document_vectors。数据库不可用路径也尚未实际接入，当前仅有原来的内存语义/keyword fallback。

`tests/core/test_jd_contract.py:104` 仍要求真实解析 tools=[]，需 A 改为明确的 Docker/Python/SQL 期望；没有删除、跳过或放宽测试。两项成员自检因此在公共回归阶段失败。

## 实际验证

- 全量 Python：**192 passed，1 failed，12 skipped**。唯一失败为上述 tools 旧期望。Jobs 91 项、Diagnosis 44 项通过。PostgreSQL 12 项明确跳过，不计通过。
- 全仓 Ruff check 与 format check：通过（73 文件）。
- 统一前端：33 passed。
- jobs/diagnosis 成员自检：模块本身通过，但公共 core 断言冲突导致整体 FAIL；不能宣称统一检查全绿。
- 真实 Edge：Jobs keyword 与真实本地模型两种模式，工具/薪资展示、选择/保存、gap、失败重试、Mock、390px、长文本/XSS、导航清理通过。真实模型模式另测否定要求和学习意向过滤。SQLite 临时内存库；不是 pgvector 链路。
- Diagnosis 公共壳 Mock smoke：空选择、pair API、Mock 标记、失败重试、390px、XSS 和导航清理通过。Diagnosis 44 项离线回归，无收费 AI 调用。
- `scripts.validate_holdout`：5 JD/3 简历来源哈希、许可、契约校验通过。
- 真实模型 holdout：见 [执行记录](D-real-holdout-2026-09-08.md)。15/15 配对回退 keyword，因为完整 JD 超出冻结的 32 片段预算；student-03 经 A 解析没有结构化 skills/experience。没有人工确认或金标准，不能声称语义准确率改善。
- 本机没有 `.verification/postgres/pgsql/bin/pg_ctl.exe`，PATH 也没有 pg_ctl/psql/docker，未获得 T5_TEST_DATABASE_URL。A 曾验证数据库不等于当前 D 已验证。HNSW/首次写入/缓存命中/变更失效/跨版本隔离/完整 Vector 链路均未完成真实验收。

可复现的真实模型执行环境：`uv run --locked --with sentence-transformers==5.1.0 --with torch==2.8.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu python tests/jobs/evaluate_real_holdout.py`，设置 PYTHONPATH=.、PYTHONUTF8=1、OMP_NUM_THREADS=2、HF_HUB_OFFLINE=1；模型需预先存在本地，未改根依赖。

## 后续与默认值

保持 T5_JOBS_EMBEDDING=off。A 提供片段 port/事务注入、同步 tools 测试后，D 完成持久化缓存；D 还需设计不截断事实的长文档预算/批处理方案，复验新独立样本。不能为了演示直接放开预算或把当前 holdout 涨分当泛化改善。

本次 D 变更只涉及 backend/modules/jobs、frontend/src/modules/jobs、tests/jobs 和 D-* 文档。公共 schema、数据库、迁移、导航、核心层、根依赖、CI、Resume、Analytics 和 Diagnosis 实现未修改。PR #6 继续指向 feat/core-a，不自动合并。
