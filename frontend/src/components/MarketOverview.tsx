import { useState, type ReactNode } from 'react';
import type { MarketAnalysis, SalaryGroup } from '../core/contracts';
import { Button } from './ui';

export function JobSkillMatrix({ data }: { data: MarketAnalysis }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const jobs = data.jobs.filter((job) =>
    `${job.title} ${job.company || ''}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(jobs.length / 8));
  const current = Math.min(page, pages - 1);
  const skills = data.skill_frequency.slice(0, 10);
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();
  return (
    <div className="job-skill-matrix">
      <label className="matrix-query">
        查找岗位
        <input
          type="search"
          value={query}
          placeholder="岗位或公司名称"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <p className="analytics-help">
        列为当前样本前 {skills.length}{' '}
        项技能，深色表示该岗位已确认或识别到此要求；空格表示未识别，不等于不要求。
      </p>
      {skills.length ? (
        <div className="matrix-scroll" role="region" aria-label="各岗位技能要求分布图" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">岗位 / 雇主</th>
                {skills.map((row) => (
                  <th scope="col" key={row.skill}>
                    {row.skill}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.slice(current * 8, current * 8 + 8).map((job) => (
                <tr key={job.jd_id}>
                  <th scope="row">
                    {job.title}
                    <small>{job.company || '雇主未知'}</small>
                  </th>
                  {skills.map((row) => {
                    const required = job.skills.some(
                      (value) => normalize(value) === normalize(row.skill),
                    );
                    return (
                      <td key={row.skill}>
                        <span
                          className={`matrix-cell ${required ? 'required' : ''}`}
                          aria-label={`${row.skill}：${required ? '已识别要求' : '未识别'}`}
                          title={`${job.title} · ${row.skill} · ${required ? '已识别要求' : '未识别'}`}
                        >
                          {required ? '●' : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>暂无技能数据，录入或确认岗位技能后即可比较。</p>
      )}
      {!jobs.length && <p>没有匹配的岗位。</p>}
      <div className="matrix-pagination">
        <span>
          {jobs.length} 个岗位 · 第 {current + 1} / {pages} 页
        </span>
        <Button disabled={!current} onClick={() => setPage(current - 1)}>
          上一组
        </Button>
        <Button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>
          下一组
        </Button>
      </div>
    </div>
  );
}

export default function MarketOverview({
  data,
  salaryGroup,
  salaryChart,
  salaryLabel,
  onSalaryChange,
  onDetails,
}: {
  data: MarketAnalysis;
  salaryGroup: SalaryGroup | undefined;
  salaryChart: ReactNode;
  salaryLabel: (group: SalaryGroup) => string;
  onSalaryChange: (key: string) => void;
  onDetails: (tab: string) => void;
}) {
  const top = data.skill_frequency[0];
  return (
    <div className="market-overview">
      <section className="market-overview-card">
        <div className="section-heading">
          <h2>热门技能词云</h2>
          <Button onClick={() => onDetails('skills')}>查看技能分布</Button>
        </div>
        <p className="analytics-help">
          字号表示包含该技能的岗位数量 · 前 {Math.min(30, data.skill_frequency.length)} 项
        </p>
        <ul className="overview-wordcloud" aria-label="已录入岗位热门技能词云">
          {data.skill_frequency.slice(0, 30).map((row, index) => (
            <li
              key={row.skill}
              style={{
                fontSize: `${16 + (26 * row.job_count) / (top?.job_count || 1)}px`,
                fontWeight: index < 5 ? 700 : 500,
              }}
              title={`${row.skill}：${row.job_count} 个岗位，占 ${row.share_percent}%`}
            >
              {row.skill}
            </li>
          ))}
        </ul>
        {!top && <p>暂无已识别的技能。</p>}
      </section>
      <section className="market-overview-card">
        <div className="section-heading">
          <h2>岗位薪资分布</h2>
          <Button onClick={() => onDetails('salary')}>查看薪资明细</Button>
        </div>
        {salaryGroup ? (
          <>
            <label className="salary-unit-select">
              薪资口径
              <select
                value={`${salaryGroup.currency}/${salaryGroup.period}`}
                onChange={(e) => onSalaryChange(e.target.value)}
              >
                {data.salary_groups.map((group) => (
                  <option
                    key={`${group.currency}/${group.period}`}
                    value={`${group.currency}/${group.period}`}
                  >
                    {salaryLabel(group)} · {group.sample_size} 个岗位
                  </option>
                ))}
              </select>
            </label>
            {salaryChart}
            <p className="analytics-help">按招聘薪资区间中点归类；币种、月薪和年薪分开统计。</p>
          </>
        ) : (
          <p>暂无币种、周期和区间完整的薪资数据。</p>
        )}
        <p className="analytics-help">
          {data.salary_coverage.missing_range_count} 条缺少完整区间，
          {data.salary_coverage.missing_unit_count} 条缺少明确单位，均未作为零值画入图表。
        </p>
      </section>
      <section className="market-overview-card overview-full">
        <h2>各岗位技能要求分布</h2>
        <JobSkillMatrix data={data} />
      </section>
      <section className="market-overview-card overview-full">
        <h2>职业规划参考</h2>
        <p>
          {top
            ? `当前录入的 ${data.sample_size} 个岗位中，${top.skill} 出现在 ${top.job_count} 个岗位（${top.share_percent}%）。可优先核对目标岗位是否要求这项技能，再结合自己的项目经历确定学习或补证据的方向。`
            : '先录入目标岗位并确认技能要求，再对照自己的经历安排学习计划。'}
        </p>
        <p>
          词频代表这批 JD
          的要求频率，不代表个人已掌握，也不能直接代表整个就业市场。不同岗位的组合要求可在上方分布图中对照。
        </p>
      </section>
    </div>
  );
}
