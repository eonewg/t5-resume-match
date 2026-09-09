# 真实抽取评测状态

尚未达到本轮真实质量验收标准。预期标注已准备，不能作为模型成绩。

| 样本 | 来源 | 实际执行 | 姓名 / 教育 / 技能 precision、recall / 经历 / 数字 / 幻觉 |
| --- | --- | --- | --- |
| student-01 | 已有脱敏公开学生简历 | 首次调用 30.09 秒超时，无结果 | 未测 |
| student-02 | 已有脱敏公开学生简历 | 未执行 | 未测 |
| student-03 | 已有脱敏公开学生简历 | 未执行 | 未测 |
| stefano-user | 用户提供完整原文 | 未执行真实 AI；仅做原文保留和失败恢复浏览器测试 | 未测 |
| mixed-representative | 明确标记的中英混排合成样本 | 未执行 | 未测 |

首次尝试使用现有配置模型 glm-5.2、Chat Completions、JSON Schema。没有收到结构化内容，不能报告技能或经历质量。后续发送被自动审批要求补充具体接收方授权，已暂停，等待用户确认。

允许发送后，以 [评测清单](../../tests/resume/fixtures/ai-evaluation/manifest.json) 为依据运行 `python -m tests.resume.evaluate_ai`，逐项审核输出和原文，再更新本表。任何超时、拒绝、schema 或事实守卫失败均保留为实际失败记录，不使用规则结果补齐成绩。

本地浏览器失败恢复已执行：用户完整原文 2906 字符，1440/390 两个屏宽；模拟 AI timeout → 原文仍在 → 重新识别提交同一原文 → 模拟限流 → 手动填写 → 保存/读取原文一致。见 [报告](browser/recovery/report.json)、[桌面失败截图](browser/recovery/failure-1440.png)、[移动失败截图](browser/recovery/failure-390.png)。此流程没有真实模型输出，不能替代成功质量验收。
