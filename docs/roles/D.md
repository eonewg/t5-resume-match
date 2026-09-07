# D：JD、岗位匹配与 AI 简历诊断

新开发分支 `feat/intelligence-d`，首次从最新 `origin/feat/core-a` 创建，PR base 固定 `feat/core-a`。遵守 [团队约定](../team-rules.md) 和 [T5 对照表](../../T5_REQUIREMENTS_MATRIX.md)。历史 `feat/diagnosis-d` 已交付并集成，继续复用，不回退或重做。

## 修改边界

负责 `backend/modules/jobs/`、`backend/modules/diagnosis/`、对应 `frontend/src/modules/` 目录、`tests/jobs/`、`tests/diagnosis/` 及 `docs/integration_requests/D-*.md`。公共数据库、Schema、API、根依赖、公共前端注册由 A 实施。

## 功能与公开入口

- jobs：JD 输入页面、技能/工具与薪资解析（无法解析可为空）、关键词匹配基线、0–100 分数、已匹配技能、缺失技能/gap 与评分解释。持久化和公共 API 由 A 提供。实现 `backend.modules.jobs.public:JobsService` 的 `parse(JDInput) -> JDData`、`match(Resume, JD) -> MatchResult`。
- 向量增强：决定 embedding 对象、模型/接口、维度、距离和关键词+向量评分逻辑，向 A 提出明确数据库需求；向量不能替代关键词基线。
- diagnosis：复用 `backend.modules.diagnosis.public:DiagnosisService`，同步 `diagnose(DiagnosisInput) -> DiagnosisResult`，无参构造。提供 STAR 内容增强、JD 定向关键词/经历建议及量化成果补充提示；保留事实，不生成虚假数字。
- 支持问题定义报告的表达 gap、技能 gap 分析；真实采样与演示数据分开，不编造分析证据。

接口以 [API 契约](../api-contract.md) 为准；薪资、向量等尚未支持的公共字段先提请求，不私自修改模型。前端导出 mount，按 [前端接入](../frontend-integration.md) 预览。

## 验证与交付

运行 [模块自检](../member-development.md) 中 jobs 和 diagnosis 两项。网络超时、重试必须有界；响应异常、缺密钥、真实调用失败不得自动降级成 Mock 成功。离线测试覆盖成功、超时、无效响应和事实边界，替换外部客户端，避免误调用收费 API。真实验证单独记录，Mock 必须显式标记。

PR 列出两个模块各自完成项、准确 SHA、测试和未完成项。缺少 jobs 时不能以 diagnosis 通过代替整分支验收；A 按模块记 PASS/BLOCKED/ADAPT。
