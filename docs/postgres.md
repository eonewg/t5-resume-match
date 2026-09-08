# PostgreSQL + pgvector 公共基础设施

本阶段已在 Windows 实测 PostgreSQL 17.6、pgvector 0.8.1、psycopg 3.3.5、pgvector-python 0.4.2。
A 提供数据库与可复用接口，D 决定模型、向量化对象、预处理、维度、距离和评分。PR #6 已集成可选 embedding 与事务片段缓存，默认仍 off；见 [验收台账](acceptance.md)。

## 启动

跨平台优先使用 `compose.yaml`（本机这轮没有 Docker，实际验收使用下方原生 Windows 路径；CI 另跑容器）：

```powershell
$env:T5_POSTGRES_PASSWORD = '替换为本地密码'
docker compose up -d --wait
$env:T5_DATABASE_URL = 'postgresql+psycopg://t5:替换为本地密码@127.0.0.1:55432/t5'
$env:T5_TEST_DATABASE_URL = $env:T5_DATABASE_URL
uv sync --locked
uv run --locked python -m scripts.migrate
uv run --locked python -m scripts.smoke_postgres
uv run --locked pytest -q
```

URL 中密码含特殊字符时需 URL 编码。端口仅绑定 127.0.0.1。数据库 volume 持续保留；普通停止使用 `docker compose stop`。
生产运行角色需要已有扩展与表权限；首次创建 extension 的迁移角色需有相应权限，不在应用里静默回退 SQLite。
SQLite URL 仍可用于离线演示，`VectorRepository` 明确拒绝 SQLite。

### 本机 Windows 已验证路径

本地运行目录 `.verification/postgres/`（已忽略，不提交 Git），包含 `pgsql/`、`pgvector/` 源码、`cluster/` 和随机本地密码文件。
使用 [PostgreSQL 官方 Windows 下载入口](https://www.postgresql.org/download/windows/) 指向的
[EDB 17.6 二进制 ZIP](https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip)，解压至该目录。
按 [pgvector 官方 Windows 编译说明](https://github.com/pgvector/pgvector/tree/v0.8.1#windows)，
使用已安装 MSVC x64 和 `PGROOT` 指向该 `pgsql`，对固定 v0.8.1（`778dacf20c07caf904557a88705142631818d8cb`）运行：

```text
nmake /F Makefile.win
nmake /F Makefile.win install
```

在仓库根的 PowerShell 7 中：

```powershell
& ./scripts/local_postgres.ps1 -Action Start
uv run --locked python -m scripts.migrate
uv run --locked python -m scripts.smoke_postgres
uv run --locked pytest -q
uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
# 后续终端连接并设置当前进程环境变量：
& ./scripts/local_postgres.ps1 -Action Connect
# 停止专用实例，保留数据：
& ./scripts/local_postgres.ps1 -Action Stop
```

脚本隐藏启动 PostgreSQL，监听 127.0.0.1:55432，使用 scram-sha-256 与随机密码；不创建 Windows 系统服务、不更改全局 PATH、不输出密码。
如修改 Port，已有 cluster 的配置也要一致，脚本不会擅自重写已有实例配置。
原生实例与 Compose 默认使用同一端口，选择一种启动方式。

## 迁移与持久化

启动生命周期与 `python -m scripts.migrate` 共用 `backend.core.migrations.migrate(engine)`。
`schema_migrations` 持久记录版本，PostgreSQL 迁移使用事务和 advisory lock：

1. 接纳既有 resumes/jobs/matches/diagnoses 或建立缺失的公共表。
2. 非破坏性补齐旧 JD JSON 的 tools/薪资字段；既有 skills、原文、Mock 标记、ID/时间均保留。
3. PostgreSQL 创建 vector extension、vector_spaces、document_vectors；SQLite 不应用此版本。
4. PostgreSQL 新增 fragment_vectors，保留已有单向量数据、索引与 API；SQLite 不应用此版本。
5. SQLite/PostgreSQL 为旧 JD JSON 补 source_type=unknown、source_url/source_name/collected_at=null，仅补缺失字段，保留已有来源、原文与确认值。

不自动复制 SQLite 数据到 PostgreSQL，不删除旧库。迁移没有自动降级/删表命令，备份后可恢复原数据库。
接口按创建后不可变的源记录工作；编辑简历生成新 ID，因此旧结果仍关联原始内容。

## D 可直接使用的接口

从 `backend.core.vectors` 导入 `VectorRepository`、`VectorSpace`、`VectorWrite`、`VectorHit`。
传入 SQLAlchemy Session，调用方管理事务；repository 从不隐式 commit。

```python
from sqlalchemy.orm import Session
from backend.core.vectors import VectorRepository, VectorSpace, VectorWrite

# 这些参数由 D 的业务配置提供，公共层没有默认模型/维度/距离。
with Session(engine) as session, session.begin():
    vectors = VectorRepository(session)
    vectors.register_space(
        VectorSpace(
            id=space_id,
            model=model_and_preprocessing_version,
            dimensions=dimensions,
            metric=metric,
        )
    )
    vectors.upsert(
        VectorWrite(
            space_id=space_id,
            kind="jd",
            document_id=saved_jd_id,
            source_hash=sha256_of_embedding_input,
            values=embedding_from_D,
        )
    )
    hits = vectors.nearest(space_id, query_vector_from_D, kind="jd", limit=10)
```

| 契约 | 语义 |
| --- | --- |
| space.id | 1–64 位字母、数字、下划线、连字符；不可重复用于不同配置 |
| model | 1–200 字符，D 应包含实际模型与预处理版本；同一空间再次注册不同模型/维度/距离报错 |
| dimensions | 显式整数 1–16000；不同维度可存不同空间，绝不跨模型比较 |
| metric | `cosine`、`l2`、`inner_product` 三选一；无默认值 |
| kind | `resume` / `jd`；外键必须引用对应公共记录，查询按类型和空间隔离 |
| source_hash | D 对确切向量化输入计算的 SHA-256（64 位小写十六进制）；A 保存并返回，不替 D 猜预处理 |
| values | 长度必须等于空间维度，有限 float32 范围；按数据库 float32 精度存储，不归一化；cosine 拒绝精度转换后零向量 |
| upsert | 同空间同文档唯一；更新向量与 source_hash，不改变源简历/JD |
| nearest | limit 1–100，默认精确查询；返回 document_id/source_hash/distance，按距离升序 |

距离来自 pgvector：cosine 为 `1-cosine_similarity`；L2 为欧氏距离；inner_product 为**负内积**（越小越接近）。
它们不是 0–100 匹配分或概率。D 负责归一化、关键词组合权重、降级及说明，A 不做任何评分换算。
源记录外键级联删除向量；API 目前不提供源记录删除路由。

## 索引

空间、源 ID 的 B-tree 索引与唯一约束随迁移创建。vector 列不锁死生产维度，数据库约束和复合外键保证维度与空间一致。

按 D 已确定的空间可显式调用 `vectors.ensure_hnsw_index(space_id)`，创建对应维度和距离的部分表达式索引；幂等，HNSW vector 上限 2000 维。
更高维度仍可精确查询；不擅自降维或切换模型。构建索引应作为管理操作执行，不放在每次匹配请求中。
默认 `nearest` 用 MATERIALIZED 候选集保持精确召回，即使已建 HNSW 也不自动改为近似。
D 明确选择 `approximate=True` 后允许使用 HNSW；结果可能减少或有召回损失，尤其含类型过滤时，须评测而非假定等同精确结果。
没有实际模型配置前不创建生产向量空间；测试只用明确标记的几何向量，smoke 回滚空间、索引与向量。

## 验证

`tests/core/test_vectors.py` 在独立随机 schema 中真实测试三种距离、写入/重连读取、更新、模型/类型隔离、维度与浮点边界、外键、级联、事务回滚、重复迁移及 HNSW。
使用 schema_translate_map 防止公共 schema 的已有表被误用于测试；结束只删除本次创建的 schema。
未设 T5_TEST_DATABASE_URL 时这组数据库测试明确跳过，不能记作通过；CI postgres job 必须设置该变量，执行全量 pytest 和 smoke。
`scripts/smoke_postgres.py` 对真实 PG 验证扩展/迁移/向量/索引及 Resume → JD → keyword match，结束清理本次记录，不调用 AI。


## 有序片段缓存与 Jobs 事务入口（2026-09-08）

新增 `FragmentSetWrite`、`FragmentVector`，仍从 `backend.core.vectors` 导入。

```python
vectors.register_space(specification)  # 完整 VectorSpace，由 D 指定
cached = vectors.get_fragments(
    specification,
    kind="jd",
    document_id=jd.id,
    source_hash=input_hash,
)
if cached is None:
    cached = vectors.replace_fragments(
        FragmentSetWrite(
            space=specification,
            kind="jd",
            document_id=jd.id,
            source_hash=input_hash,
            fragments=encoded_vectors,
        )
    )
values = [fragment.values for fragment in cached]
```

- `get_fragments(space, *, kind, document_id, source_hash)`：单条 SELECT 返回一致快照；未缓存、已清空或 hash 不符返回 `None`。未知空间或空间完整配置不符报 `ValueError`，调用前应 register_space。不会筛选单个 hash 后返回部分片段。
- `replace_fragments(batch)`：按输入列表顺序生成连续 `index=0..n-1`，返回 `list[FragmentVector]`。每项包含 `space_id/kind/document_id/source_hash/index/values`。`fragments=[]` 原子清空，后续读取为 `None`；不缓存空数组命中。
- 整组共享一个 hash，由 D 对**实际编码的完整有序输入**计算。顺序、片段边界或内容改变须换 hash；公共层不保存片段原文，也不生成 embedding。model/revision/preprocessing 变化使用新 space.id，并在 model 中保留完整身份。读写都比较完整空间配置，拒绝以旧 ID 套用新配置。
- 每个向量检查维度、有限 float32、cosine 非零；读回同样验证，拒绝混合 hash 或非连续 index。值为 pgvector float32，未归一化。调用方若还需要确认业务预期片段数量，应与当前输入数量比较。
- 新表 `fragment_vectors` 与旧 `document_vectors` 隔离。唯一键分别为 `(space_id,resume_id,index)` 和 `(space_id,jd_id,index)`；源类型互斥、维度复合外键、源和空间删除级联。D 只使用 repository，不依赖表结构。
- 替换在 SAVEPOINT 中锁定源文档行，再删旧组、批量写新组；并发首次写入也串行化。同 hash 写入仍为整组替换，命中时调用方应直接复用。并发竞争是最后成功写入组生效，读取必须始终传当前 hash。多文档写入统一先 Resume 后 JD、同类按 ID 排序，避免交叉加锁。
- 不做隐式 commit；保存点成功后仍受外层事务控制，外层回滚会撤销整组替换。数据库语句失败会回滚替换保存点。旧 upsert/nearest/HNSW 仅操作整篇单向量，接口与 cosine 距离 `1 - similarity` 不变。

Jobs 可选实现公开同步方法：

```python
from backend.core.matching import MatchContext


def match_with_context(self, resume, jd, context: MatchContext):
    with context.vector_repository() as vectors:
        if vectors is not None:
            # 在此 register_space/get_fragments/replace_fragments。
            # 模型生成、缓存命中后评分及降级策略全部留在 D。
            pass
    return self.match(resume, jd)
```

该示例仅说明调用形状；D JobsService 已在 PR #6 实现接入。公共 `TransactionalJobsProvider` Protocol 位于 `backend.core.ports`。
无参装载及原 `match(resume,jd)` 保持；仅当存在 `match_with_context` 才由编排层优先调用，启动时验证同步与三参数签名。
Context 每次调用新建，不写到共享 provider 实例；禁止在调用结束后保留 Context/repository，不自行开 Session/commit/rollback。
Resume/JD 读取、缓存访问、MatchRecord 保存均使用 HTTP 请求同一个 Session/事务；workflow 后续 diagnosis 失败时缓存和匹配记录共同回滚。
`context.vector_repository()` 在 PostgreSQL 上开嵌套保存点并提供 repository；SQLite 明确提供 `None`。
数据库异常在保存点退出回滚后继续向 D 抛出，D 可在 `with` **外部**捕获并执行自己的内存/关键词降级，不应在保存点内部吞掉 SQL 错误。
连接本身中断或外层事务不可用不能靠保存点恢复，仍由公共错误处理失败返回；不声称所有数据库故障都可继续提交。
SQLAlchemy 进入保存点会先 flush 外层待写对象，因此公共编排在此入口前不放置待写 MatchRecord；外层已有数据错误不属于可忽略缓存故障。
