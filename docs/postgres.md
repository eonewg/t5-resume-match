# PostgreSQL + pgvector 公共基础设施

本阶段已在 Windows 实测 PostgreSQL 17.6、pgvector 0.8.1、psycopg 3.3.5、pgvector-python 0.4.2。
A 提供数据库与可复用接口，D 决定模型、向量化对象、预处理、维度、距离和评分。未实现或启用 embedding 算法。

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
    vectors.register_space(VectorSpace(
        id=space_id, model=model_and_preprocessing_version,
        dimensions=dimensions, metric=metric,
    ))
    vectors.upsert(VectorWrite(
        space_id=space_id, kind="jd", document_id=saved_jd_id,
        source_hash=sha256_of_embedding_input, values=embedding_from_D,
    ))
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
