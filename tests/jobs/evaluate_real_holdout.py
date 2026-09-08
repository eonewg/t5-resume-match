"""Unmodified A holdout, actual parser outputs; no gold labels or quality claims."""

import json
from pathlib import Path

from backend.modules.jobs.embedding import LocalMiniLM, chunks
from backend.modules.jobs.evidence_filter import filter_clauses
from backend.modules.jobs.public import JobsService
from backend.modules.jobs.vector_plan import source_hash, vector_space
from backend.modules.resume.public import ResumeService
from backend.schemas.contracts import JD, JDInput, Resume, TextInput


def main():
    root = Path(__file__).resolve().parents[2]
    data = root / "data/holdout/2026-09-08"
    provider = LocalMiniLM()
    # Separately verify the real model is available, even if full documents exceed budget.
    probe = provider.encode(["Python programming", "Python 编程"])
    assert len(probe) == 2 and all(len(vector) == 384 for vector in probe)
    service = JobsService(embedding=provider, semantic_weight=0.2)
    jobs, resumes = [], []
    for path in sorted((data / "jd").glob("*.json")):
        row = json.loads(path.read_text(encoding="utf-8"))
        jobs.append(
            JD(
                id=row["id"],
                **service.parse(
                    JDInput(**{key: row[key] for key in ("title", "company", "jd_text")})
                ).model_dump(),
            )
        )
    for path in sorted((data / "resumes").glob("*.json")):
        row = json.loads(path.read_text(encoding="utf-8"))
        resumes.append(
            Resume(
                id=row["id"],
                **ResumeService().parse(TextInput(raw_text=row["raw_text"])).model_dump(),
            )
        )
    lines = [
        "# D：2026-09-08 真实 holdout 执行记录",
        "",
        "固定 A 的 5 JD × 3 公开历史学生简历，未裁剪/翻译原文、未调词表、权重或预算。",
        "简历采用 A 当前 ResumeService 的自动解析结果，尚无人确认及独立人工金标准，不能报告准确率/录用排序质量。",
        "真实本地模型两条探针已执行成功；完整文档是否成功单独记录。",
        "",
        f"空间：`{vector_space().id}`；model：`{vector_space().model}`；384 维 cosine。",
        "",
        "## JD 解析",
        "",
        "| ID | skills / tools 数 | salary |",
        "| --- | --- | --- |",
    ]
    for jd in jobs:
        lines.append(f"| {jd.id} | {len(jd.skills)} / {len(jd.tools)} | {jd.salary or 'null'} |")
    lines += [
        "",
        "## 输入与预算",
        "",
        "| ID | 结构化技能 / 经历条数 | 片段数 / source_hash |",
        "| --- | --- | --- |",
    ]
    for document in [*jobs, *resumes]:
        is_jd = isinstance(document, JD)
        filtered = filter_clauses(
            [document.jd_text] if is_jd else document.experience + document.skills, jd=is_jd
        )
        try:
            fragments = chunks(list(filtered.kept))
            status = (
                f"{len(fragments)} / {source_hash(fragments)}" if fragments else "0 / 无有效输入"
            )
        except ValueError:
            status = "超过现有 32 片段预算；不截断以制造成功"
        lines.append(
            f"| {document.id} | {len(document.skills)} / {'—' if is_jd else len(document.experience)} | {status} |"
        )
    lines += [
        "",
        "## 相同输入 15 配对",
        "",
        "| JD | Resume | keyword | 内存增强结果 | semantic | 状态 | pgvector 缓存 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for jd in jobs:
        for resume in resumes:
            detail = service.match_detail(resume, jd)
            assert detail.result.matched_skills == service.keyword_match(resume, jd).matched_skills
            lines.append(
                f"| {jd.id} | {resume.id} | {detail.keyword_score} | {detail.final_score} | {detail.semantic_score} | {detail.status} | 未执行：公共片段读写契约缺失 |"
            )
    lines += [
        "",
        "缓存首次生成、再次命中、输入变化重新生成、跨空间隔离均未完成真实数据库验收。",
        "哈希/空间隔离单元测试不等于持久化缓存验收；不得将本表 keyword fallback 标为 embedding 成功。",
        "下一步需 A 片段读取/写入与 session 注入契约；长 JD 预算问题另行设计后再用新样本复验。默认保持 off。",
        "",
    ]
    target = root / "docs/integration_requests/D-real-holdout-2026-09-08.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    print("Wrote", target)


if __name__ == "__main__":
    main()
