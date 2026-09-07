# D：AI 诊断模块

固定分支：`feat/diagnosis-d`。先读取根 [AGENTS.md](../../AGENTS.md)。

负责 AI 调用、Prompt、STAR 内容增强和面向 JD 的定向建议。允许修改 `backend/modules/diagnosis/`、`tests/diagnosis/`、`docs/integration_requests/D-*.md`。前端组件预留 `frontend/src/modules/diagnosis/`，需先与 A 确认共享前端工程。

不修改公共接口、根配置和依赖；向 A 提交所需配置名、依赖及示例值，真实密钥不提交。成果数字只能依据用户输入，不编造经历。

实现 `backend.modules.diagnosis.public:DiagnosisService`，无参构造，同步 `diagnose(DiagnosisInput) -> DiagnosisResult`。输入是简历与 JD 原文，输出为 summary 和 suggestions。

网络调用有明确超时和有限重试；响应解析失败、缺少密钥等错误不能伪装为成功诊断。测试使用替身覆盖成功、超时、无效响应，不误调用收费 API。具备可用凭证时再做明确区分的真实调用验证。交付由 A 配置 `T5_DIAGNOSIS_PROVIDER`。
