"""Conservative, offline parsing. Every extracted value comes from the input."""

import re

from backend.schemas.contracts import ResumeData, TextInput

SECTIONS = {
    "name": ("姓名", "name", "full name"),
    "education": ("学历", "学位", "教育", "教育背景", "教育经历", "education"),
    "skills": (
        "技能",
        "专业技能",
        "技术技能",
        "技能清单",
        "技能特长",
        "skills",
        "technical skills",
    ),
    "experience": (
        "经历",
        "项目经历",
        "项目经验",
        "工作经历",
        "工作经验",
        "实习经历",
        "实习经验",
        "experience",
        "work experience",
        "internship experience",
        "projects",
        "project experience",
    ),
    "other": (
        "联系方式",
        "电话",
        "手机",
        "邮箱",
        "求职意向",
        "个人信息",
        "基本信息",
        "个人简介",
        "自我评价",
        "个人评价",
        "兴趣爱好",
        "荣誉奖项",
        "获奖经历",
        "证书",
        "语言能力",
        "contact",
        "email",
        "phone",
        "profile",
        "summary",
        "objective",
        "interests",
        "awards",
        "certificates",
        "languages",
    ),
}
HEADINGS = {label.casefold(): section for section, labels in SECTIONS.items() for label in labels}
LABEL = re.compile(
    r"^(?P<label>"
    + "|".join(re.escape(label) for label in sorted(HEADINGS, key=len, reverse=True))
    + r")(?:\s*[:：]\s*(?P<value>.*)|\s*)$",
    re.IGNORECASE,
)
SKILLS = (
    "Python",
    "SQL",
    "Excel",
    "Power BI",
    "Tableau",
    "Pandas",
    "NumPy",
    "JavaScript",
    "TypeScript",
    "Java",
    "C++",
    "C#",
    "C",
    "Go",
    "Rust",
    "HTML",
    "CSS",
    "React",
    "Vue",
    "Node.js",
    "FastAPI",
    "Django",
    "Flask",
    "Spring Boot",
    "MySQL",
    "PostgreSQL",
    "SQLite",
    "Redis",
    "MongoDB",
    "Linux",
    "Git",
    "Docker",
    "Kubernetes",
    "Spark",
    "Hadoop",
    "R",
    "SPSS",
    "MATLAB",
    "数据分析",
    "数据可视化",
    "机器学习",
    "深度学习",
)
SKILL_TOKEN = re.compile(
    r"(?<![A-Za-z0-9_+#])(?:"
    + "|".join(re.escape(skill) for skill in sorted(SKILLS, key=len, reverse=True))
    + r")(?![A-Za-z0-9_+#])",
    re.IGNORECASE,
)
CANONICAL = {skill.casefold(): skill for skill in SKILLS}
NEGATIVE = re.compile(
    r"不会|不熟|不懂|不了解|未掌握|未使用|没用过|没有|暂无|待学|计划|希望|打算|尚未|不具备|学习目标"
    r"|\b(?:not|no|without|want|plan|wish|learning)\b",
    re.IGNORECASE,
)
AFFIRMED = re.compile(
    r"使用|运用|掌握|熟悉|熟练|精通|擅长|\b(?:used?|using|built|developed|proficient|familiar)\b",
    re.IGNORECASE,
)
EMPTY = re.compile(r"^(?:无|暂无|未提供|未知|none|n/a|unknown)[。.]?$", re.IGNORECASE)


def heading(line):
    candidate = re.sub(r"^\s*(?:#{1,6}\s*|[-*•]\s+)", "", line).strip().strip("* ")
    match = LABEL.fullmatch(candidate)
    if match:
        return HEADINGS[match["label"].casefold()], (match["value"] or "").strip()
    # An unrecognized section heading stops capture rather than becoming an experience.
    if re.fullmatch(r"[^:：]{1,40}[:：]", candidate):
        return "other", ""
    return None


class ResumeService:
    """Parse labeled Chinese/English sections; missing information stays empty."""

    def parse(self, data: TextInput) -> ResumeData:
        section = None
        name = None
        education = []
        experiences = []
        paragraph = []
        skills = []

        def flush_experience():
            if paragraph:
                experiences.append("\n".join(paragraph))
                paragraph.clear()

        for raw_line in data.raw_text.splitlines():
            line = raw_line.strip()
            found = heading(line)
            if found:
                flush_experience()
                section, line = found
            if not line:
                flush_experience()
                continue
            if section == "name":
                if name is None and not EMPTY.fullmatch(line):
                    name = re.split(r"[|｜;；]", line, maxsplit=1)[0].strip()
                section = None
            elif section == "education" and not EMPTY.fullmatch(line):
                education.append(line)
            elif section == "experience" and not EMPTY.fullmatch(line):
                paragraph.append(line)

            if section not in ("skills", "experience", None):
                continue
            for clause in re.split(r"[，,;；。\n]|\bbut\b|但是|但", line, flags=re.IGNORECASE):
                if NEGATIVE.search(clause):
                    continue
                if section != "skills" and not AFFIRMED.search(clause):
                    continue
                for match in SKILL_TOKEN.finditer(clause):
                    skill = CANONICAL[match.group().casefold()]
                    if skill not in skills:
                        skills.append(skill)
        flush_experience()
        if len(experiences) > 500:
            experiences = experiences[:499] + ["\n\n".join(experiences[499:])]
        return ResumeData(
            name=name,
            education="\n".join(education),
            skills=skills,
            experience=experiences,
            raw_text=data.raw_text,
        )
