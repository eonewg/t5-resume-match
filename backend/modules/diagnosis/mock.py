"""Explicit offline demo only. Never selected automatically after a real API failure."""

import json


class MockLLM:
    is_mock = True

    def complete(self, messages: list[dict]) -> str:
        data = json.loads(messages[1]["content"])
        original = data["resume_text"].strip()[:500]
        return json.dumps(
            {
                "summary": "【Mock 演示】展示诊断结构，未调用真实模型，不代表真实诊断质量。",
                "star_rewrites": [
                    {
                        "original": original,
                        "optimized": original,
                        "reason": "【Mock】此处保留输入原文，仅演示对照阅读；未生成真实改写。",
                    }
                ],
                "jd_targeted_suggestions": [
                    "【Mock】逐条核对岗位要求，仅补充有真实经历支撑的内容。"
                ],
                "keywords_to_strengthen": [],
                "risks": [],
            },
            ensure_ascii=False,
        )
