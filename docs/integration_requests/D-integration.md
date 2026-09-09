# Diagnosis 公共集成事项

Owner：D；公共层负责人：A。
开发分支：feat/intelligence-d；PR：feat/intelligence-d → feat/core-a。

## 当前接口

DiagnosisService 通过 backend.modules.diagnosis.public:DiagnosisService 接入，无参构造，同步 diagnose(DiagnosisInput) → DiagnosisResult。公共输出为 summary + suggestions，STAR、JD、关键词与风险建议按标签写入 suggestions。

公共 diagnoses/workflow 路由、provider 环境配置及 frontend/src/modules/diagnosis/index.js 已接入系统。使用说明见 [Diagnosis README](../../backend/modules/diagnosis/README.md)。

## 待处理事项

| 事项 | Owner | 验证要求 |
| --- | --- | --- |
| 公共客户端 45 秒与模型超时/重试的总预算对齐 | A 公共层、D 模型调用 | 慢响应、超时、取消及重试测试；真实模型延迟验证 |
| Starlette HTTPX/AnyIO 弃用提示 | A | 更新公共依赖后运行公共及模块回归 |
| 真实诊断效果 | D，A 系统验收 | 使用有效配置和脱敏样本验证事实、STAR、JD 定向性、延迟和费用，不以离线替身代替 |

真实密钥不提交。缺少密钥或调用失败应明确失败，不冒充 Mock 成功。具体处理完成后补充准确提交和验证证据。
