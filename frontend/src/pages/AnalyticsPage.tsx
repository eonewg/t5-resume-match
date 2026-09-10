import Icon from '../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { analyticsTopics } from '../core/analytics-navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  connectAnalytics,
  initialFilters,
  type AnalyticsController,
} from '../modules/analytics/controller.ts';
import { useController } from '../core/WorkspaceContext';
import type { AnalysisResponse, SkillFrequency, SalaryGroup } from '../core/contracts';
import { Button, Chips, Feedback, NextLink, PageHeading, SafeSource } from '../components/ui';

const sources: Record<string, string> = {
  real: '真实采样',
  course: '课程样本',
  synthetic: '合成演示',
  unknown: '来源暂未提供',
};
const periods: Record<string, string> = { hour: '小时', day: '日', month: '月', year: '年' };
const number = (value: number) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
const start = (controller: AnalyticsController) => {
  void controller.load();
};
function SkillColumns({ rows }: { rows: SkillFrequency[] }) {
  const gradient = useId();
  const shown = rows.slice(0, 6);
  const ceiling = Math.max(4, Math.ceil(Math.max(0, ...shown.map((row) => row.job_count)) / 4) * 4);
  return (
    <div className="skill-chart-layout">
      <svg
        viewBox="0 0 370 230"
        className="skill-column-chart"
        role="img"
        aria-label="热门技能岗位数量柱状图"
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#80adff" />
            <stop offset="1" stopColor="#d3e4ff" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => (
          <g key={tick}>
            <line x1="35" x2="363" y1={190 - tick * 40} y2={190 - tick * 40} stroke="#e7effb" />
            <text x="27" y={194 - tick * 40} textAnchor="end">
              {(ceiling * tick) / 4}
            </text>
          </g>
        ))}
        {shown.map((row, index) => {
          const x = 43 + index * (320 / shown.length);
          const height = (row.job_count / ceiling) * 160;
          const width = Math.min(33, 240 / shown.length);
          return (
            <g key={row.skill}>
              <title>
                {row.skill}：{row.job_count} 条岗位，占 {row.share_percent}%
              </title>
              <rect
                x={x}
                y={190 - height}
                width={width}
                height={height}
                rx="2"
                fill={`url(#${gradient})`}
              />
              <text x={x + width / 2} y={182 - height} textAnchor="middle">
                {row.job_count}
              </text>
              <text x={x + width / 2} y="211" textAnchor="middle">
                {row.skill.length > 7 ? row.skill.slice(0, 6) + '…' : row.skill}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="skill-ranking">
        <h3>热门技能 TOP {Math.min(5, rows.length)}</h3>
        <ol>
          {rows.slice(0, 5).map((row, index) => (
            <li key={row.skill}>
              <span>{index + 1}</span>
              <strong>{row.skill}</strong>
              <small>{row.job_count}</small>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
function SkillChart({
  rows,
  selected,
  onSelect,
}: {
  rows: SkillFrequency[];
  selected: string | null;
  onSelect: (skill: string) => void;
}) {
  return (
    <ul id="analytics-skills" className="analytics-skill-list" aria-label="热门技能岗位覆盖率">
      {rows.slice(0, 10).map((row, index) => (
        <li key={row.skill}>
          <button
            type="button"
            aria-pressed={selected === row.skill}
            onClick={() => onSelect(row.skill)}
          >
            <span className="skill-position">{String(index + 1).padStart(2, '0')}</span>
            <span className="skill-bar-content">
              <span className="analytics-bar-label">
                <strong>{row.skill}</strong>
                <span>
                  {row.job_count} 条 · {row.share_percent}%
                </span>
              </span>
              <span className="analytics-bar-track" aria-hidden="true">
                <span className="analytics-bar-fill" style={{ width: `${row.share_percent}%` }} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
function SalaryHistogram({ group }: { group: SalaryGroup }) {
  const gradient = useId();
  const midpoints = group.ranges.map((row) => row.lower / 2 + row.upper / 2);
  const maximum = Math.max(1, ...midpoints);
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 6));
  const step = Math.ceil(maximum / 6 / magnitude) * magnitude;
  const counts = Array.from({ length: 6 }, () => 0);
  for (const value of midpoints) counts[Math.min(5, Math.floor(value / step))]++;
  const ceiling = Math.max(2, Math.ceil(Math.max(0, ...counts) / 2) * 2);
  const compact = (value: number) => (value >= 1000 ? `${number(value / 1000)}k` : number(value));
  return (
    <svg
      viewBox="0 0 420 180"
      className="salary-histogram"
      role="img"
      aria-label={`${group.currency} 每${periods[group.period] || group.period}薪资区间中点分布，${group.sample_size}条岗位`}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#367bff" />
          <stop offset="1" stopColor="#d3e4ff" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((tick) => (
        <g key={tick}>
          <line x1="24" x2="415" y1={140 - tick * 55} y2={140 - tick * 55} stroke="#e7effb" />
          <text x="19" y={144 - tick * 55} textAnchor="end">
            {number((ceiling * tick) / 2)}
          </text>
        </g>
      ))}
      {counts.map((count, index) => (
        <g key={index}>
          <title>
            {number(index * step)}–{number((index + 1) * step)} {group.currency}：{count}{' '}
            条岗位（区间中点）
          </title>
          <rect
            x={35 + index * 64}
            y={140 - (count / ceiling) * 110}
            width="40"
            height={(count / ceiling) * 110}
            rx="3"
            fill={`url(#${gradient})`}
          />
          <text x={55 + index * 64} y={133 - (count / ceiling) * 110} textAnchor="middle">
            {count}
          </text>
          <text x={55 + index * 64} y="160" textAnchor="middle">
            {compact(index * step)}–{compact((index + 1) * step)}
          </text>
        </g>
      ))}
    </svg>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div
      className="analytics-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={headers.join('、')}
    >
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AnalysisSection({
  title,
  help,
  children,
  id,
}: {
  title: string;
  help?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="analysis-section">
      <h2>
        <Icon
          name={
            id === 'analytics-salary' ? 'target' : id === 'analytics-sources' ? 'resume' : 'chart'
          }
        />
        {title}
      </h2>
      {help && <p className="analytics-help">{help}</p>}
      {children}
    </section>
  );
}
export function AnalyticsResult({ result }: { result: AnalysisResponse }) {
  const data = result.market;
  const [salaryKey, setSalaryKey] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = analyticsTopics;
  const tab = tabs.find((item) => item.id === searchParams.get('tab'))?.id || 'skills';
  const setTab = (id: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('tab', id);
      return next;
    });
  };
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const skill = data?.skill_frequency.some((row) => row.skill === selectedSkill)
    ? selectedSkill
    : null;
  const jobs = data?.jobs.filter((job) => !skill || job.skills.includes(skill)) || [];
  const salaryGroup =
    data?.salary_groups.find((group) => `${group.currency}/${group.period}` === salaryKey) ||
    data?.salary_groups.find((group) => group.currency === 'CNY' && group.period === 'month') ||
    data?.salary_groups.reduce<(typeof data.salary_groups)[number] | undefined>(
      (largest, group) => (!largest || group.sample_size > largest.sample_size ? group : largest),
      undefined,
    );
  const toggleSkill = (value: string) => {
    setSelectedSkill((current) => (current === value ? null : value));
    setTab('jobs');
  };
  return (
    <>
      {result.is_mock && <p className="status-badge">Mock · 演示数据，请勿用于真实市场结论</p>}
      {!data ? (
        <AnalysisSection title="市场摘要" help="当前服务未提供完整市场指标。">
          <p>{result.summary}</p>
          <Table
            headers={['技能', '岗位数']}
            rows={Object.entries(result.skills).map(([skill, count]) => [skill, String(count)])}
          />
        </AnalysisSection>
      ) : (
        <>
          <header id="analytics-metrics" className="analytics-metrics">
            <div className="metric-card panel">
              <span className="material-icon">
                <Icon name="jobs" />
              </span>
              <div>
                <span>已记录岗位</span>
                <strong>{data.sample_size}</strong>
                <small>
                  全库 {result.scope?.available_count ?? data.sample_size} 条 · 已知雇主{' '}
                  {data.company_count} 家
                </small>
              </div>
            </div>
            <div className="metric-card panel">
              <span className="material-icon">
                <Icon name="trend" />
              </span>
              <div>
                <span>热门技能</span>
                <strong>{data.skill_frequency.length}</strong>
                <small>当前岗位样本中的技能 / 工具</small>
              </div>
            </div>
            <div className="metric-card panel">
              <span className="material-icon">
                <Icon name="resume" />
              </span>
              <div>
                <span>可比较薪资样本</span>
                <strong>{data.salary_coverage.comparable_count}</strong>
                <small>
                  未知或单位不明{' '}
                  {data.salary_coverage.missing_range_count +
                    data.salary_coverage.missing_unit_count}{' '}
                  条
                </small>
              </div>
            </div>
          </header>
          <p id="analytics-scope" className="analytics-scope">
            来源：
            {Object.entries(data.source_counts)
              .filter(([, count]) => count)
              .map(([key, count]) => `${sources[key] || key} ${count}`)
              .join(' · ') || '暂无'}
            。采集日期：
            {data.collected_from ? `${data.collected_from} 至 ${data.collected_to}` : '未知'}
            ；无日期 {data.undated_count} 条。已知雇主 {data.company_count} 家。
          </p>
          {Boolean(result.scope?.excluded_mock_count) && (
            <p className="analytics-help">
              已排除 {result.scope?.excluded_mock_count} 条标记为演示数据的记录。
            </p>
          )}
          {!data.sample_size ? (
            <AnalysisSection id="analytics-empty" title="还没有可分析的岗位">
              <p>{result.summary}</p>
              <p>添加岗位后即可了解技能需求；已有岗位可在筛选中选择“全部来源”。</p>
              <NextLink to="/jobs">添加目标岗位 →</NextLink>
            </AnalysisSection>
          ) : (
            <>
              <div className="market-tabs" role="tablist" aria-label="市场分析主题">
                {tabs.map((item, index) => (
                  <button
                    type="button"
                    role="tab"
                    key={item.id}
                    id={`market-tab-${item.id}`}
                    aria-controls={`market-panel-${item.id}`}
                    aria-selected={tab === item.id}
                    tabIndex={tab === item.id ? 0 : -1}
                    onClick={() => setTab(item.id)}
                    onKeyDown={(event) => {
                      const next =
                        event.key === 'ArrowRight'
                          ? (index + 1) % tabs.length
                          : event.key === 'ArrowLeft'
                            ? (index + tabs.length - 1) % tabs.length
                            : event.key === 'Home'
                              ? 0
                              : event.key === 'End'
                                ? tabs.length - 1
                                : -1;
                      if (next < 0) return;
                      event.preventDefault();
                      setTab(tabs[next].id);
                      document.getElementById(`market-tab-${tabs[next].id}`)?.focus();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div
                className="market-topic"
                role="tabpanel"
                id="market-panel-skills"
                aria-labelledby="market-tab-skills"
                hidden={tab !== 'skills'}
                tabIndex={0}
              >
                <AnalysisSection
                  title="热门技能"
                  help={`当前 ${data.sample_size} 条岗位中的技能要求分布 · 柱状图前 ${Math.min(6, data.skill_frequency.length)} 项`}
                >
                  <p className="analytics-help">
                    展开覆盖率可按技能筛选岗位；自动识别关键词，比例以全部样本为分母。
                  </p>
                  <SkillColumns rows={data.skill_frequency} />
                  <details className="analytics-details" open>
                    <summary>技能覆盖率与岗位筛选</summary>
                    <SkillChart
                      rows={data.skill_frequency}
                      selected={skill}
                      onSelect={toggleSkill}
                    />
                  </details>
                  {!data.skill_frequency.length && <p>尚无已识别或确认的技能关键词。</p>}
                  <details className="analytics-details">
                    <summary>查看全部 {data.skill_frequency.length} 项技能频率</summary>
                    <Table
                      headers={['技能 / 工具', '岗位数量', '占样本比例']}
                      rows={data.skill_frequency.map((row) => [
                        row.skill,
                        String(row.job_count),
                        `${row.share_percent}%`,
                      ])}
                    />
                  </details>
                </AnalysisSection>
                <details className="analytics-cloud-panel" open>
                  <summary>热门技能词云</summary>
                  <p className="analytics-help">
                    字号随岗位数量变化 · 前 {Math.min(30, data.skill_frequency.length)} 项
                  </p>
                  <ul id="analytics-cloud" className="analytics-cloud">
                    {data.skill_frequency.slice(0, 30).map((row) => (
                      <li
                        className="analytics-cloud-word"
                        key={row.skill}
                        style={{
                          fontSize: `${14 + (17 * row.job_count) / (data.skill_frequency[0]?.job_count || 1)}px`,
                        }}
                        title={`${row.skill}：${row.job_count}/${data.sample_size} 条岗位，${row.share_percent}%`}
                      >
                        <span>{row.skill}</span>
                        <small>{row.job_count} 条</small>
                      </li>
                    ))}
                  </ul>
                  {!data.skill_frequency.length && <p>尚无已识别或确认的技能关键词。</p>}
                </details>
              </div>
              <div
                className="market-topic"
                role="tabpanel"
                id="market-panel-salary"
                aria-labelledby="market-tab-salary"
                hidden={tab !== 'salary'}
                tabIndex={0}
              >
                <AnalysisSection
                  id="analytics-salary"
                  title="岗位薪资分布"
                  help="原始招聘区间 · 按币种与周期分组"
                >
                  {!data.salary_groups.length && (
                    <div className="analytics-empty-salary">
                      <strong>当前样本未披露可比较的薪资</strong>
                      <p>
                        {data.salary_coverage.missing_range_count} 条缺少完整区间，
                        {data.salary_coverage.missing_unit_count} 条币种或周期未确认。
                      </p>
                      <NextLink to="/jobs">录入带薪资的岗位 →</NextLink>
                    </div>
                  )}
                  {data.salary_groups.length > 0 && (
                    <label className="salary-unit-select">
                      薪资口径
                      <select
                        aria-label="薪资口径"
                        value={salaryGroup ? `${salaryGroup.currency}/${salaryGroup.period}` : ''}
                        onChange={(e) => setSalaryKey(e.target.value)}
                      >
                        {data.salary_groups.map((group) => (
                          <option
                            key={`${group.currency}/${group.period}`}
                            value={`${group.currency}/${group.period}`}
                          >
                            {group.currency} / {periods[group.period] || group.period} ·{' '}
                            {group.sample_size} 条
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {salaryGroup && (
                    <>
                      <p className="salary-histogram-note">
                        按每条岗位薪资区间的中点计数 · 非实际到手薪资
                      </p>
                      <SalaryHistogram group={salaryGroup} />
                    </>
                  )}
                  <details className="analytics-details salary-range-details" open>
                    <summary>查看各岗位原始薪资区间</summary>
                    {data.salary_groups.map((group) => {
                      const max = Math.max(0, ...group.ranges.map((row) => row.upper));
                      const scale = max || 1;
                      return (
                        <section
                          className="analytics-salary-group"
                          hidden={group !== salaryGroup}
                          key={`${group.currency}/${group.period}`}
                          data-currency={group.currency}
                          data-period={group.period}
                        >
                          <h3>
                            {group.currency} / {periods[group.period] || group.period} ·{' '}
                            {group.sample_size} 条
                          </h3>
                          <p className="salary-range-legend">
                            横轴：{group.currency} / {periods[group.period] || group.period}
                            ；线段左端为最低值，右端为最高值，圆点表示单一报价。
                          </p>
                          <div className="analytics-salary-axis">
                            {[0, 1, 2, 3, 4].map((tick) => (
                              <span key={tick} style={{ left: `${tick * 25}%` }}>
                                {number((max * tick) / 4)}
                              </span>
                            ))}
                          </div>
                          {group.ranges.map((row) => (
                            <div className="analytics-salary-row" key={row.jd_id}>
                              <div className="analytics-bar-label">
                                <span>{row.title}</span>
                                <span>
                                  {number(row.lower)}–{number(row.upper)} {group.currency}/
                                  {periods[group.period] || group.period}
                                </span>
                              </div>
                              <div className="analytics-salary-track" aria-hidden="true">
                                <span
                                  className={`analytics-salary-range ${row.lower === row.upper ? 'is-point' : ''}`}
                                  style={{
                                    left: `${(row.lower / scale) * 100}%`,
                                    width: `${((row.upper - row.lower) / scale) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </section>
                      );
                    })}
                  </details>
                  <details className="helper-disclosure">
                    <summary>薪资口径与缺失值</summary>
                    <p>
                      没有完整区间 {data.salary_coverage.missing_range_count}{' '}
                      条；币种/周期未确认或不支持 {data.salary_coverage.missing_unit_count}{' '}
                      条。这些记录仍参与技能统计，不以零薪资进入图表。
                    </p>
                    <p>
                      分组内从 0
                      起画，不同币种、周期各用独立刻度，不折汇、不跨周期换算，不求跨组平均值。
                    </p>
                  </details>
                </AnalysisSection>
              </div>
              <div
                className="market-topic"
                role="tabpanel"
                id="market-panel-jobs"
                aria-labelledby="market-tab-jobs"
                hidden={tab !== 'jobs'}
                tabIndex={0}
              >
                <AnalysisSection
                  id="analytics-sources"
                  title="岗位样本"
                  help="统计单位是已保存岗位记录；重复手动录入分别计数，固定快照导入会去重。来源标签来自录入资料，不等于独立事实核验。"
                >
                  <details className="analytics-details" open>
                    <summary>
                      {skill
                        ? `${skill} · ${jobs.length} 条相关岗位`
                        : `共 ${jobs.length} 条岗位来源`}
                    </summary>
                    {skill && <Button onClick={() => setSelectedSkill(null)}>清除技能筛选</Button>}
                    <Table
                      headers={['岗位 / 雇主', '已确认或解析的技能', '来源与采集日期', '薪资状态']}
                      rows={jobs.map((job) => [
                        <>
                          <strong>{job.title}</strong>
                          <small>{job.company || '雇主未知'}</small>
                        </>,
                        <Chips values={job.skills} empty="未识别 / 未确认" />,
                        <>
                          <span>{sources[job.source_type] || job.source_type}</span>
                          {job.source_url && (
                            <SafeSource url={job.source_url}>
                              {job.source_name || '查看来源'}
                            </SafeSource>
                          )}
                          <small>{job.collected_at || '采集日期未知'}</small>
                        </>,
                        <>
                          {
                            {
                              comparable: '已进入对应分组',
                              missing_range: '暂未提供完整区间',
                              missing_unit: '暂未提供薪资单位',
                            }[job.salary_status]
                          }
                          {job.salary && <small>{job.salary}</small>}
                        </>,
                      ])}
                    />
                  </details>
                </AnalysisSection>
              </div>
              <details className="market-methodology">
                <summary>样本解读与统计口径</summary>
                <AnalysisSection id="analytics-observations" title="样本解读">
                  <div className="market-findings">
                    <p>
                      <strong>{data.skill_frequency[0]?.skill || '暂无技能'}</strong>
                      <span>
                        最高覆盖 {data.skill_frequency[0]?.share_percent ?? 0}% 的岗位样本
                      </span>
                    </p>
                    <p>
                      <strong>{data.company_count} 家雇主</strong>
                      <span>已知雇主覆盖；不代表全部就业市场</span>
                    </p>
                    <p>
                      <strong>
                        {Math.round(
                          (100 * data.salary_coverage.comparable_count) / data.sample_size,
                        )}
                        % 薪资披露
                      </strong>
                      <span>币种与周期明确的样本占比</span>
                    </p>
                  </div>
                  <details className="analytics-details">
                    <summary>统计口径与使用边界</summary>
                    <ul>
                      {data.observations.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </details>
                </AnalysisSection>
              </details>
            </>
          )}
        </>
      )}
    </>
  );
}
export default function AnalyticsPage() {
  const { state: s, controller } = useController(connectAnalytics, start, 'analytics');
  const [filters, setFilters] = useState(initialFilters);
  const [wide, setWide] = useState(false);
  const [feedSource, setFeedSource] = useState<'ncss' | 'jobicy'>('ncss');
  useEffect(() => {
    if (!wide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWide(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', escape);
    };
  }, [wide]);
  if (!s) return <p role="status">正在读取市场洞察…</p>;
  const c = controller.current!;
  return (
    <div
      className={`analytics-page market-dashboard ${wide ? 'market-dashboard-wide' : ''}`}
      data-module="analytics"
    >
      <div className="market-heading">
        <PageHeading title="市场洞察">岗位需求 · 技能热度 · 薪资分布</PageHeading>
        <div className="inline-actions">
          <select
            aria-label="外部招聘来源"
            value={feedSource}
            disabled={Boolean(s.busy)}
            onChange={(event) => setFeedSource(event.target.value as 'ncss' | 'jobicy')}
          >
            <option value="ncss">中国 · 国家就业平台</option>
            <option value="jobicy">全球 · Jobicy 远程岗位</option>
          </select>
          <Button
            id="analytics-external-import"
            disabled={Boolean(s.busy)}
            onClick={async () => {
              await c.importExternal(feedSource);
              setFilters(initialFilters());
            }}
          >
            {s.busy === 'external' ? '正在同步…' : '同步外部岗位'}
          </Button>
          <Button className="secondary" onClick={() => setWide(!wide)}>
            {wide ? '退出大屏' : '大屏模式'}
          </Button>
        </div>
      </div>
      <p className="market-feed-note">
        {feedSource === 'ncss' ? (
          <>
            <SafeSource url="https://www.ncss.cn/student/jobs/index.html">
              国家大学生就业服务平台
            </SafeSource>{' '}
            · 国内招聘，手动同步最新最多 30 条公开记录
          </>
        ) : (
          <>
            <SafeSource url="https://jobicy.com">Jobicy</SafeSource> ·
            全球远程岗位，手动同步最新最多 200 条
          </>
        )}
        。缓存 1 小时；保留首次采集的岗位详情与来源。
      </p>
      <details id="analytics-filters" className="analytics-filter-panel">
        <summary>筛选来源与日期 · 默认真实采样</summary>
        <form
          className="analytics-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void c.load(filters);
          }}
        >
          <div>
            <label htmlFor="analytics-source">数据来源</label>
            <select
              id="analytics-source"
              value={filters.source_type}
              disabled={Boolean(s.busy)}
              onChange={(e) => setFilters({ ...filters, source_type: e.target.value })}
            >
              <option value="">全部来源</option>
              {Object.entries(sources).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {(['date_from', 'date_to'] as const).map((key, i) => (
            <div key={key}>
              <label htmlFor={i ? 'analytics-to' : 'analytics-from'}>
                采集日期 · {i ? '止' : '起'}
              </label>
              <input
                id={i ? 'analytics-to' : 'analytics-from'}
                type="date"
                value={filters[key]}
                disabled={Boolean(s.busy)}
                onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
              />
            </div>
          ))}
          <Button type="submit" disabled={Boolean(s.busy)}>
            {s.busy ? '正在更新…' : '应用筛选'}
          </Button>
        </form>
      </details>
      <Feedback id="analytics-status" error={s.error} busy={Boolean(s.busy)}>
        {s.notice ||
          (s.busy === 'import' ? '正在导入真实快照…' : s.busy ? '正在整理市场信息…' : '')}
      </Feedback>
      {s.error && (
        <Button disabled={Boolean(s.busy)} onClick={() => void c.load(filters)}>
          重试加载
        </Button>
      )}
      <div id="analytics-results" aria-busy={Boolean(s.busy)}>
        {s.result && <AnalyticsResult result={s.result} />}
      </div>
    </div>
  );
}
