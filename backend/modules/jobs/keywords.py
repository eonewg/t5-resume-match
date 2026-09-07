"""Versioned, conservative vocabulary: aliases denote the same term, not related skills."""

import json
import re
import unicodedata
from pathlib import Path

TOOLS = {
    name: [name]
    for name in (
        "Python",
        "Java",
        "C++",
        "C#",
        "R",
        "SQL",
        "MySQL",
        "PostgreSQL",
        "Redis",
        "Excel",
        "Tableau",
        "FineBI",
        "Docker",
        "Linux",
        "Git",
        "Spark",
        "Hadoop",
        "Hive",
        "Flink",
        "Kafka",
        "Airflow",
        "ClickHouse",
        "Scala",
        "CUDA",
        "OpenCV",
        "XGBoost",
        "LightGBM",
        "FastAPI",
        "Django",
        "React",
        "HTML",
        "CSS",
        "Postman",
        "MyBatis",
        "etcd",
        "gRPC",
        "Transformer",
        "pandas",
    )
}
TOOLS.update(
    {
        "JavaScript": ["JavaScript", "JS"],
        "TypeScript": ["TypeScript", "TS"],
        "Go": ["Go", "Golang"],
        "Kubernetes": ["Kubernetes", "K8s"],
        "PyTorch": ["PyTorch", "Pytorch"],
        "TensorFlow": ["TensorFlow"],
        "scikit-learn": ["scikit-learn", "sklearn"],
        "Power BI": ["Power BI", "PowerBI"],
        "SQL Server": ["SQL Server", "MSSQL"],
        "Spring Boot": ["Spring Boot", "SpringBoot"],
        "Vue": ["Vue", "Vue.js"],
        ".NET Core": [".NET Core"],
        ".NET Framework": [".NET Framework"],
        "HiveSQL": ["HiveSQL"],
    }
)
SKILLS = {
    name: [name]
    for name in (
        "数据清洗",
        "数据可视化",
        "数据仓库",
        "维度建模",
        "指标体系",
        "指标口径",
        "统计分析",
        "统计学",
        "机器学习",
        "深度学习",
        "推荐系统",
        "推荐策略",
        "用户行为分析",
        "个性化推荐",
        "漏斗分析",
        "留存分析",
        "用户分层",
        "用户画像",
        "需求分析",
        "需求文档",
        "产品设计",
        "特征工程",
        "模型训练",
        "模型部署",
        "模型压缩",
        "模型评估",
        "图像分割",
        "目标检测",
        "时间序列分析",
        "回归分析",
        "异常检测",
        "假设检验",
        "单元测试",
        "接口测试",
        "接口设计",
        "分布式系统",
        "多线程",
        "微服务",
        "高并发",
        "高可用",
        "数据治理",
        "数据监控",
        "实时指标",
        "实时计算",
        "批处理",
        "架构设计",
        "索引优化",
        "慢查询优化",
        "异步编程",
        "关系型数据库",
        "关系数据库",
        "ETL",
        "HTTP/HTTPS",
        "RESTful API",
        "API设计",
        "PRD撰写",
        "RFM模型",
        "AIPL模型",
        "LTV分析",
        "Prompt工程",
        "RAG",
    )
}
SKILLS.update(
    {
        "A/B测试": ["A/B测试", "A/B 测试", "A/B实验", "AB测试", "AB实验"],
        "自然语言处理": ["自然语言处理", "NLP"],
        "支持向量机": ["支持向量机", "SVM"],
        "数据结构与算法": ["数据结构与算法", "数据结构和算法"],
    }
)
VOCABULARY = TOOLS | SKILLS

# Frozen domain vocabulary seeded from A's JD annotations; only exact text occurrences
# are extracted. No sample ID, score, or manually matched/missing result is used at runtime.
for term in json.loads(Path(__file__).with_name("domain_terms.json").read_text(encoding="utf-8")):
    VOCABULARY.setdefault(term, [term])


def normalized(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


ALIASES = {normalized(alias): name for name, aliases in VOCABULARY.items() for alias in aliases}


def canonicalize(values: list[str]) -> dict[str, str]:
    """Return unique normalized key -> display label, preserving unknown declared skills."""
    result = {}
    for value in values:
        value = value.strip()
        if value:
            label = ALIASES.get(normalized(value), normalized(value))
            result[normalized(label)] = label
    return result


def extract(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text).casefold()
    hits = []
    for alias, label in ALIASES.items():
        pattern = re.escape(alias).replace(r"\ ", r"\s+")
        # ASCII boundaries prevent Java in JavaScript, SQL in MySQL and R in report.
        for match in re.finditer(r"(?<![a-z0-9_])" + pattern + r"(?![a-z0-9_+#])", text):
            prefix = text[max(0, match.start() - 16) : match.start()]
            if re.search(
                r"(?:无需|不要求|不会|未掌握|不熟悉|未使用|计划学习)[^，,。;；\n]{0,8}$", prefix
            ):
                continue
            hits.append((match.start(), match.end(), label))
    # Suppress nested aliases (SQL inside SQL Server), retain adjacent independent terms.
    accepted = []
    for start, end, label in sorted(hits, key=lambda hit: (-(hit[1] - hit[0]), hit[0])):
        if not any(start < right and end > left for left, right, _ in accepted):
            accepted.append((start, end, label))
    return sorted({label for _, _, label in accepted}, key=normalized)
