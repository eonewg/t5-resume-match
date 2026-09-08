"""Explicit real-model + real-PG acceptance; default pytest never runs this script."""

import json
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.matching import MatchContext
from backend.core.vectors import FragmentSetWrite, VectorRepository
from backend.modules.jobs.embedding import MAX_DOCUMENT_FRAGMENTS, LocalMiniLM, chunks
from backend.modules.jobs.evidence_filter import filter_clauses
from backend.modules.jobs.public import JobsService
from backend.modules.jobs.vector_plan import source_hash, vector_space
from backend.schemas.contracts import JD, Resume
from tests.core.test_vectors import pg_engine
from tests.jobs.test_cache_postgres import api_on


class CountedLocal(LocalMiniLM):
    def __init__(self):
        self.calls = 0
        self.texts = 0

    def encode(self, texts):
        self.calls += 1
        self.texts += len(texts)
        return super().encode(texts)


def main():
    root = Path(__file__).resolve().parents[2]
    data = root / "data/holdout/2026-09-08"
    provider = CountedLocal()
    service = JobsService(embedding=provider, semantic_weight=0.2)
    spec = vector_space()
    results, documents = [], []
    with contextmanager(pg_engine.__wrapped__)() as engine, api_on(engine, service) as (client, _):
        with Session(engine) as session:
            database = session.scalar(text("SHOW server_version"))
            extension = session.scalar(
                text("SELECT extversion FROM pg_extension WHERE extname='vector'")
            )
        jobs, resumes = [], []
        for path in sorted((data / "jd").glob("*.json")):
            row = json.loads(path.read_text(encoding="utf-8"))
            response = client.post(
                "/api/v1/jobs", json={k: row[k] for k in ("title", "company", "jd_text")}
            )
            assert response.status_code == 201
            jobs.append(
                (
                    row["id"],
                    JD(**{k: v for k, v in response.json().items() if k in JD.model_fields}),
                )
            )
        for path in sorted((data / "resumes").glob("*.json")):
            row = json.loads(path.read_text(encoding="utf-8"))
            preview = client.post("/api/v1/resumes/preview", json={"raw_text": row["raw_text"]})
            assert preview.status_code == 200
            response = client.post("/api/v1/resumes", json=preview.json())
            assert response.status_code == 201
            resumes.append(
                (
                    row["id"],
                    Resume(
                        **{k: v for k, v in response.json().items() if k in Resume.model_fields}
                    ),
                )
            )
        for label, document in jobs + resumes:
            is_jd = isinstance(document, JD)
            raw = [document.jd_text] if is_jd else document.experience + document.skills
            fragments = chunks(
                list(filter_clauses(raw, jd=is_jd).kept), limit=MAX_DOCUMENT_FRAGMENTS
            )
            documents.append(
                (label, len(fragments), source_hash(fragments) if fragments else "empty")
            )
        for job_label, jd in jobs:
            for resume_label, resume in resumes:
                memory = service.match_detail(resume, jd)
                # Force a genuine miss for each pair via the public whole-set API.
                with Session(engine) as session, session.begin():
                    repo = VectorRepository(session)
                    repo.register_space(spec)
                    for kind, document in (("resume", resume), ("jd", jd)):
                        repo.replace_fragments(
                            FragmentSetWrite(
                                space=spec,
                                kind=kind,
                                document_id=document.id,
                                source_hash="0" * 64,
                                fragments=[],
                            )
                        )
                before = provider.calls
                with Session(engine) as session, session.begin():
                    miss = service.match_detail(resume, jd, context=MatchContext(session))
                miss_calls = provider.calls - before
                before = provider.calls
                with Session(engine) as session, session.begin():
                    hit = service.match_detail(resume, jd, context=MatchContext(session))
                assert provider.calls == before, "cache hit unexpectedly encoded"
                assert (
                    miss.result.matched_skills
                    == hit.result.matched_skills
                    == memory.result.matched_skills
                )
                assert (
                    miss.result.missing_skills
                    == hit.result.missing_skills
                    == memory.result.missing_skills
                )
                assert miss.status == hit.status == memory.status
                delta = 0.0
                if memory.status == "semantic":
                    assert "resume:miss, jd:miss" in miss.result.gap_analysis[-1]
                    assert "resume:hit, jd:hit" in hit.result.gap_analysis[-1]
                    assert miss_calls > 0
                    assert miss.semantic_score == hit.semantic_score
                    delta = abs(memory.semantic_score - hit.semantic_score)
                    assert delta < 0.0001 and abs(memory.final_score - hit.final_score) <= 0.010001
                else:
                    assert memory.status == "empty", "unexpected real-model fallback"
                    assert miss_calls == 0
                results.append(
                    (
                        job_label,
                        resume_label,
                        memory.keyword_score,
                        memory.semantic_score,
                        memory.final_score,
                        miss.final_score,
                        hit.final_score,
                        memory.status,
                        miss_calls,
                        delta,
                    )
                )
                print(
                    job_label,
                    resume_label,
                    memory.status,
                    memory.final_score,
                    miss.final_score,
                    hit.final_score,
                    flush=True,
                )
        # Confirm the public HTTP hook and MatchRecord commit use the real cache too.
        _, jd = jobs[0]
        _, resume = resumes[1]
        body = {"resume_id": resume.id, "jd_id": jd.id}
        first = client.post("/api/v1/matches", json=body)
        before = provider.calls
        second = client.post("/api/v1/matches", json=body)
        assert first.status_code == second.status_code == 201
        assert (
            provider.calls == before and "resume:hit, jd:hit" in second.json()["gap_analysis"][-1]
        )
    lines = [
        "# D：真实 PostgreSQL + 模型 holdout 验收",
        "",
        f"PostgreSQL {database}；pgvector {extension}；空间 `{spec.id}`。",
        f"模型 `{spec.model}`，384 维 cosine，固定 0.8 keyword + 0.2 semantic，默认 off。",
        "使用 A 原始 5 JD × 3 简历；简历采用 A 自动解析输出，未经人工确认，未构造金标准。",
        "此批已在此前暴露长度问题；本次是固定算法的集成回归，不是新的独立盲测/生产准确率。",
        "",
        "| 文档 | 完整片段数 | source_hash |",
        "| --- | --- | --- |",
    ]
    lines += [f"| {label} | {count} | {digest} |" for label, count, digest in documents]
    lines += [
        "",
        "| JD | Resume | keyword | semantic（内存） | final 内存 | final PG miss | final PG hit | 状态 | miss 编码批次 | semantic 差值 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    lines += [
        "| " + " | ".join(f"{x:.8f}" if isinstance(x, float) else str(x) for x in row) + " |"
        for row in results
    ]
    lines += [
        "",
        "每组强制公共整组清空后 miss，再独立事务 hit；hit 编码调用均为 0。miss/hit semantic 与 final 完全相等，内存差值限制 1e-4 分（float32/批次浮点误差）；final 两位小数跨舍入边界最多 0.01。",
        "所有结构化 matched/missing 保持一致。student-03 自动解析无有效 skills/experience，保留 empty/keyword 降级；未从 raw_text 擅自恢复技能。",
        "HTTP Resume preview → 保存 → JD parse/save → Vector cache → Matching → MatchRecord 已实际执行；测试数据在独立随机 schema 内，由 A 测试 fixture 清理。",
        "仍有限制：同一雇主、历史学生简历、自动解析遗漏、过滤误伤及薪资/非技术上下文噪声，不能以分数变化声称质量改善。默认 off。",
        "",
    ]
    target = root / "docs/integration_requests/D-pg-holdout-2026-09-08.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    print("PASS report:", target)


if __name__ == "__main__":
    main()
