"""Descriptive sample statistics, never inferred salaries or labor-market forecasts."""

import re
import unicodedata
from collections import Counter, defaultdict

from backend.schemas.contracts import (
    JD,
    AnalysisResult,
    MarketAnalysis,
    MarketJob,
    SalaryCoverage,
    SalaryGroup,
    SalaryRange,
    SkillFrequency,
)


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).split()).casefold()


def salary_status(job: JD) -> str:
    if job.salary_min is None or job.salary_max is None:
        return "missing_range"
    if (
        not job.currency
        or not re.fullmatch(r"[A-Za-z]{3}", job.currency)
        or job.currency.upper() == "XXX"
        or (job.salary_period or "").lower() not in {"hour", "day", "month", "year"}
    ):
        return "missing_unit"
    return "comparable"


class AnalyticsService:
    is_mock = False

    def analyze(self, jobs: list[JD]) -> AnalysisResult:
        # The public layer supplies only persisted, filtered records. Never re-parse JD text.
        jobs = [JD.model_validate(job.model_dump()) for job in jobs]
        labels, counts = {}, Counter()
        per_job = []
        groups = defaultdict(list)
        coverage = Counter()
        sources = Counter({key: 0 for key in ("real", "course", "synthetic", "unknown")})
        for job in jobs:
            keys = set()
            for skill in job.skills:
                key = normalized(skill)
                labels.setdefault(key, " ".join(skill.split()))
                keys.add(key)
            counts.update(keys)  # One incidence per JD; tools never add a second count.
            sources[job.source_type] += 1
            status = salary_status(job)
            coverage[status] += 1
            if status == "comparable":
                groups[(job.currency.upper(), job.salary_period.lower())].append(
                    SalaryRange(
                        jd_id=job.id, title=job.title, lower=job.salary_min, upper=job.salary_max
                    )
                )
            per_job.append(
                MarketJob(
                    jd_id=job.id,
                    title=job.title,
                    company=job.company,
                    skills=[labels[key] for key in sorted(keys)],
                    source_type=job.source_type,
                    source_url=job.source_url,
                    source_name=job.source_name,
                    collected_at=job.collected_at,
                    salary=job.salary,
                    salary_status=status,
                )
            )
        ordered = sorted(counts, key=lambda key: (-counts[key], key))
        size = len(jobs)
        dates = [job.collected_at for job in jobs if job.collected_at is not None]
        companies = {normalized(job.company) for job in jobs if job.company and job.company.strip()}
        summary = (
            f"当前筛选包含 {size} 条已录入 JD、{len(companies)} 家已知雇主；"
            f"{len(counts)} 种技能/工具关键词，{coverage['comparable']} 条薪资可按同币种、同周期比较。"
            if size
            else "尚无符合筛选条件的已录入 JD。请先录入岗位或调整来源、采集日期筛选。"
        )
        observations = [
            "统计单位为已录入的 JD 记录；同一 JD 的同名技能仅计一次，tools 不额外计数。百分比分母为当前筛选全部 JD，技能之间可重叠。",
            "日期代表资料采集日期，不是职位发布日期；无日期的记录不进入有日期边界的筛选。快照不代表岗位当前仍在招聘。",
            "薪资图展示招聘区间原值，按币种和周期分别绘制；不折汇、不折算年/月薪，不把未披露或单位不明的薪资记成零。",
        ]
        if size:
            if ordered:
                first = ordered[0]
                observations.append(
                    f"样本内出现最多的关键词是 {labels[first]}（{counts[first]}/{size} 条 JD）。"
                    "可作为目标岗位对照清单；仅在确有经历时补充对应技能和证据，不据频率宣称已掌握。"
                )
            observations.append(
                f"{coverage['missing_range']} 条没有完整薪资区间，{coverage['missing_unit']} 条缺少可比较的币种/周期。"
                "这些记录仍计入样本量与技能统计，但不进入薪资区间图。"
            )
            observations.append(
                "样本仅有一家已知雇主，存在明显雇主集中偏差；不能外推整个就业市场。"
                if len(companies) == 1
                else "这是当前录入样本的描述性分析，存在来源、岗位和时间选择偏差，不能外推整个就业市场。"
            )
        market = MarketAnalysis(
            sample_size=size,
            company_count=len(companies),
            unknown_company_count=sum(not job.company or not job.company.strip() for job in jobs),
            source_counts=dict(sources),
            collected_from=min(dates) if dates else None,
            collected_to=max(dates) if dates else None,
            undated_count=size - len(dates),
            skill_frequency=[
                SkillFrequency(
                    skill=labels[key],
                    job_count=counts[key],
                    share_percent=round(100 * counts[key] / size, 2),
                )
                for key in ordered
            ],
            jobs=per_job,
            salary_coverage=SalaryCoverage(
                comparable_count=coverage["comparable"],
                missing_range_count=coverage["missing_range"],
                missing_unit_count=coverage["missing_unit"],
            ),
            salary_groups=[
                SalaryGroup(
                    currency=currency, period=period, sample_size=len(ranges), ranges=ranges
                )
                for (currency, period), ranges in sorted(groups.items())
            ],
            observations=observations,
        )
        return AnalysisResult(
            summary=summary, skills={labels[key]: counts[key] for key in ordered}, market=market
        )
