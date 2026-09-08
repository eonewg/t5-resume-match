# 补充 STAR 验证

独立于 `../2026-09-08` 原固定评估，本批在 `ac952ff63e37214392f66fb42fe4446026556c81` 上执行；仅增加评估材料，不修改系统、Diagnosis、Prompt、UI 或配置。

调用前固定两组完整项目段落。S1 为 student-01 的 SFLE 网页原型/MySQL 项目，配 Canonical 分布式系统测试 JD（含 web/database 加分项）；S2 为 student-02 的 Tecorigin 算子性能优化项目，配 Canonical 毕业生软件岗位（含性能/工程要求）。段落从已归档公开履历逐字摘取，不是解析器抽取，不增补事实、不声称硬条件全部满足；JD 使用已归档全文。

保持现有 custom/openai_chat、glm-5.2、30 秒单次超时、最多三次服务内部尝试、4096 输出 token、reasoning 未指定。Prompt `d-v1` 的文件哈希、非秘密配置、端点哈希与原固定评估文件哈希均记入 operator-record.json；密钥与端点明文不入库。

| 案例 | 外层验证 | 服务内部尝试 | 结果 | 时间 | 可评 STAR |
| --- | --- | --- | --- | --- | --- |
| S1 | 1 次 | 3 次 | TemporaryLLMError | 93.133 秒 | 无 |
| S2 | 1 次 | 3 次 | TemporaryLLMError | 94.140 秒 | 无 |

这是两次**请求失败**，不是两次成功返回空 STAR。不能评价原文忠实度、新增事实/数字、JD 针对性或改写可用性，四项保持 null；失败不记作 0 分或“无新增事实”。按用户指示不更改 Prompt、不改超时、不更换样本、不重复执行来补成功。

- `operator-record.json`：固定输入、来源/配置哈希、原始尝试与失败记录。
- `reviewer-materials.json`：独立评价材料，不含生成模型身份或配置；不声称完全盲评。
- `independent-review.json`：独立 Agent 对证据及无法评分原因的核验，不是人工评审。
- `run.py`：本批执行程序；从仓库根设置 `PYTHONPATH` 后运行。已有 completed/failed/started 不重跑；中断的 started 需人工调查，不能偷偷重新调用。

结论：补充验证操作与记录完成，当前配置下真实模型可用性不足，本批无法得出 STAR 改写效果结论。原固定评估及其两空改写/一失败均保持原样；本批结果不加入原评估分母。后续合并审查应明确看到这一限制，不以历史合成 smoke 的成功替代本批质量结果。
