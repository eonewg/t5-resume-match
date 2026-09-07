"""Explicit offline demo only. Never selected automatically after a real API failure."""

import json


class MockLLM:
    def complete(self, messages: list[dict]) -> str:
        data = json.loads(messages[1]["content"])
        original = data["resume_text"].strip()[:500]
        return json.dumps(
            {
                "summary": "【Mock 演示】展示诊断结构，未调用真实模型，不代表真实诊断质量。",
                "star_rewrites": [
                    {
                        "original": original,
                        "optimized": "情境：【待补充：项目背景】；任务：【待补充：个人职责】；"
                        "行动：" + original + "；结果：【待补充：可验证成果】",
                        "reason": "【Mock】保留原始事实，用 STAR 标明需要补充的信息。",
                    }
                ],
                "jd_targeted_suggestions": [
                    "【Mock】逐条核对岗位要求，仅补充有真实经历支撑的内容。"
                ],
                "keywords_to_strengthen": [],
                "risks": ["这是离线结构演示；请核实所有改写事实，不能编造技能或成果数字。"],
            },
            ensure_ascii=False,
        )
