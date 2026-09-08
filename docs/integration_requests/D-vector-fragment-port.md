# D → A：片段向量缓存所需最小契约（ADAPT）

基线 e3d1c16ae4f，D 已 merge。现有 VectorRepository 的 register_space / space / upsert / nearest / ensure_hnsw_index 可用于整篇文档向量检索，但不能实现本阶段要求的片段缓存。

## 实际缺口

1. 没有按 space + kind + document_id 读取 values 的方法。nearest 仅返回 ID/hash/distance，不能用于重建向量或缓存命中后的 pair scoring。
2. upsert 唯一键为 space + 文档；同一文档多个片段会互相覆盖。不得为每个片段创建假 JD/Resume，也不使用按片段序号创建大量空间的规避方式。
3. JobsService 由公共 Provider 无参装载，match(Resume, JD) 没有请求 Session/VectorRepository 注入；需要明确事务归属与降级隔离。

## 建议最小能力（待 A 确定签名，非已发布接口）

- 按 `(space_id, kind, document_id)` 读取有序片段集，返回 space 身份、source_hash、fragment ordinal 和 values；缺失明确返回 None。
- 原子替换同一文档的完整片段集，并删除此次不存在的旧片段；source_hash 覆盖完整有序输入。也可用等效的 batch fragment API，由 A 决定存储形式。
- 通过公共装载方式注入 repository factory / 事务作用域；数据库不可用须不污染公共请求 Session，D 可退回内存 embedding，模型不可用退 keyword。
- 公共测试涵盖重连读回、同文档多片段、替换删除旧片段、类型/空间隔离、事务回滚和合法性校验。

D 接入后：校验空间全字段 → 读取片段集 → hash 相同且 ordinal/数量/维度/有限值/非零向量合法则复用 → 否则重新 encode 并原子替换。主流程只做 pair scoring，不调用 nearest。HNSW 单独验证，cosine similarity = 1 - distance，近似不等于精确。

## D 已固定的参数

- provider：本地 sentence-transformers；model `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`。
- revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`，384 维，cosine，预处理 `t5-clauses-v2`。
- space ID 为 `t5-clauses-` + SHA256(`model@revision|preprocessing|cosine|384`) 前 48 位；公共 model 字段保存完整 model@revision|preprocessing。注册时比较完整身份，不仅依赖 ID。
- 输入：JD 原文过滤后的片段；Resume 已确认 experience + skills 过滤后的片段。NFKC、空白归一、80 字符切片、有序去重、32 片段预算保持不变。
- source_hash = SHA256(UTF-8(JSON 有序输入数组，ensure_ascii=False、无分隔空格)))。只哈希真正 encode 的文本，不再归一化；顺序和片段边界保留。模型/预处理变化由独立空间隔离。
- semantic = 100 × mean(max(0, max_resume cosine(jd_fragment, resume_fragment)))；final = round(0.8 keyword + 0.2 semantic, 2)。matched/missing 仅来自关键词事实，不改逻辑。
- `vector_plan.py` 当前仅提供真实公共 VectorSpace 定义及哈希纯函数；不是已接通的缓存适配器。

本次不修改 A 公共层、表、迁移或依赖。T5_JOBS_EMBEDDING 默认仍 off。收到上述公共能力后才能完成缓存验收；不能将整篇向量 nearest 伪装为现有片段评分。

## A 公共测试同步请求

`tests/core/test_jd_contract.py:104` 仍要求真实 Jobs 对 `Python SQL Docker` 返回 `tools == []`，与本次明确要求的自动 tools 解析及 A 交接文档相冲突。请 A 将这里的期望明确更新为 `['Docker', 'Python', 'SQL']`，保留 salary 空值、关键词结果、原文及公共持久化断言。D 不删除/跳过此测试，也不为通过测试而返回空 tools。
