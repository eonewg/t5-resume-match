## 本次交付

- Owner 与源分支（A：feat/core-a；D：feat/intelligence-d）：
- 目标分支（D → feat/core-a；最终交付仅 feat/core-a → main）：
- 待验收提交 SHA / A 基线：
- 对应 T5 条目（问题定义 / Level 1 / Level 2 / Level 3 / 基础设施）：
- 模块（resume / jobs-matching / diagnosis / analytics）与本次完成行为：
- 尚未实现、仍为 Mock 或需公共适配的内容：

## 公开入口与证据

- 公开 module:Class、输入和预期输出：
- 模块自检、测试命令与实际结果：
- 前端入口、截图/浏览器复现：
- 依赖、配置或契约请求（docs/integration_requests/D-主题.md）：
- 数据来源、脱敏及事实边界（如涉及样本/AI）：

## 限制与验收

区分离线替身、Mock 与真实 AI/数据库验证；不附真实密钥。不虚构实验结果。

A 按准确提交记录 PASS/BLOCKED/ADAPT。D 的 jobs 与 diagnosis 分别验收，不能用历史 diagnosis PASS 代替新增要求。最终 PR 还需提供 PostgreSQL/pgvector、完整演示、E2E、README 和 clean clone / fresh install 证据。
