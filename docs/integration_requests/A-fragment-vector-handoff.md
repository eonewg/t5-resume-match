# A → D：片段向量与请求事务交接

日期：2026-09-08。A 基线 `e3d1c16`；核对 D PR #6 源 `5ce3dea7c05dbb9d53a4db166962d6e9879f7203`，本次不合并 PR #6、不接入或修改 embedding/长文档/评分算法。

## 已发布 API

从 `backend.core.vectors` 导入：

- `VectorSpace`：仍使用 D 的完整 model@revision|preprocessing、维度、metric 和唯一 id。
- `FragmentSetWrite(space, kind, document_id, source_hash, fragments)`：fragments 为有序二维浮点列表。
- `VectorRepository.replace_fragments(batch) -> list[FragmentVector]`：同文档、同空间整组替换；空列表清空。
- `VectorRepository.get_fragments(space, *, kind, document_id, source_hash) -> list[FragmentVector] | None`：读回 values；缓存不存在或 hash 不匹配为 None；配置不符、数据损坏报错。
- `FragmentVector`：`space_id/kind/document_id/source_hash/index/values`；连续 index 从 0 开始，顺序与传入 fragments 一致。

migration 4 新增 fragment_vectors，与旧 document_vectors 独立；旧 register_space/space/upsert/nearest/ensure_hnsw_index 保持。D 不直接查表。
source_hash 覆盖实际有序编码输入；A 不重算哈希、不保存文本、不做评分。模型/预处理变更必须换空间，读写核对完整空间身份。
替换会删除旧组全部片段，文档行锁串行化并发写，保存点保护中途失败；外层 rollback 仍撤销成功写入，repository 不 commit。
cosine 距离仍为 `1 - cosine_similarity`，不映射为匹配分。数据库 float32 数值维度、有限性及 cosine 非零验证不变。

## 正式注入

D 保持无参 provider 和旧 `match(resume,jd)`，可新增：

```python
def match_with_context(self, resume, jd, context):
    with context.vector_repository() as vectors:
        if vectors is not None:
            # register_space → get_fragments → missing 时 encode/replace_fragments
            pass
    # D 使用缓存或新向量执行原有 pair scoring，返回 MatchResult。
```

`MatchContext` 位于 `backend.core.matching`，Protocol `TransactionalJobsProvider` 位于 `backend.core.ports`。
公共层检测到新方法就优先调用；旧 provider 不变。Context 每次请求新建，Resume/JD 读取、仓储和 MatchRecord 使用同一 Session。
SQLite 时 vectors 为 None；PG 操作有嵌套保存点。缓存异常须在 with 外捕获，才能在保存点回滚后执行 D 的降级策略；连接中断导致整个事务不可用时，不能承诺降级后仍能提交。
不要保留 Context/repository，不创建独立事务，不调用全局连接或内部表。多文档缓存写入按 Resume → JD，同类型按 ID 排序，避免交叉加锁。

## tools 公共回归

`Python SQL Docker` 现在明确期望 `['Docker', 'Python', 'SQL']`，保留薪资空值、关键词分数/gap、原文及持久化检查。
A 旧基线尚未携带 D 的 tools 输出，本次仅采用 D 已有的 `skills` → `TOOLS` 标签输出规则；没有同步过滤、薪资或 embedding 功能。
D merge A 时保留自己完整 parse 流程与同一 tools 输出，不要恢复空 tools。

## 验证

- 本地 PostgreSQL 17.6 / pgvector 0.8.1：完整 Python **163 passed**，无 skip；其中 vector 测试文件 31 项（含两项 SQLite 不可用契约）。
- 覆盖 Resume/JD 多片段批量写入、物理重连读 values、同 hash 命中、hash 变化整组替换、模型/预处理空间隔离、无效向量、数据库中途失败、并发替换、源删除级联、迁移 3→4 保留旧数据、cosine 与旧单向量 API。
- HTTP 匹配成功提交缓存，workflow 后续失败回滚缓存和 MatchRecord；缓存保存点异常后主事务仍可写入。
- 前端 **33 passed**；依赖锁同步、Ruff、迁移、PG smoke、公共 scope/member 检查通过。
- 首次沙箱运行受 pytest 临时目录权限与 Node spawn EPERM 阻止；正常授权环境复跑后以上检查全部通过。
- 远端 CI 与本次准确 commit SHA 将在推送后的 PR #6 交接评论提供，不能把本地通过写成远端已通过。

完整调用契约与限制见 [PostgreSQL 文档](../postgres.md#有序片段缓存与-jobs-事务入口2026-09-08)。D 的真实模型与算法验收仍由 D 完成，本交接仅解除公共存储/事务阻塞。
