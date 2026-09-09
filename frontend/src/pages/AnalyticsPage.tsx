import { useState, type ReactNode } from 'react';
import {
  connectAnalytics,
  initialFilters,
  type AnalyticsController,
} from '../modules/analytics/controller.ts';
import { useController } from '../core/WorkspaceContext';
import type { AnalysisResponse } from '../core/contracts';
import { Button, Feedback, NextLink, PageHeading, SafeSource } from '../components/ui';

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
function Card({
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
    <section id={id} className="card analytics-card">
      <h2>{title}</h2>
      {help && <p className="analytics-help">{help}</p>}
      {children}
    </section>
  );
}
export function AnalyticsResult({ result }: { result: AnalysisResponse }) {
  const data = result.market;
  return (
    <>
      {result.is_mock && <p className="status-badge">Mock · 演示数据，请勿用于真实市场结论</p>}
      {!data ? (
        <Card title="市场摘要" help="当前服务未提供完整市场指标。">
          <p>{result.summary}</p>
          <Table
            headers={['技能', '岗位数']}
            rows={Object.entries(result.skills).map(([skill, count]) => [skill, String(count)])}
          />
        </Card>
      ) : (
        <>
          <div id="analytics-metrics" className="analytics-metrics">
            {[
              [
                data.sample_size,
                '岗位样本',
                `当前筛选 / 已录入 ${result.scope?.available_count ?? data.sample_size} 条`,
              ],
              [data.company_count, '已知雇主', `雇主未知 ${data.unknown_company_count} 条`],
              [
                data.skill_frequency[0]?.skill || '暂无',
                '热门技能',
                `共 ${data.skill_frequency.length} 项技能 / 工具`,
              ],
              [
                data.salary_coverage.comparable_count,
                '可比较薪资',
                `未知或单位不明 ${data.salary_coverage.missing_range_count + data.salary_coverage.missing_unit_count} 条`,
              ],
            ].map(([value, title, detail]) => (
              <article className="card analytics-metric" key={title}>
                <p>{title}</p>
                <strong>{value}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </div>
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
            <Card id="analytics-empty" title="还没有可分析的岗位">
              <p>{result.summary}</p>
              <p>添加岗位后即可了解技能需求；已有岗位可在筛选中选择“全部来源”。</p>
              <NextLink to="/jobs">添加目标岗位 →</NextLink>
            </Card>
          ) : (
            <>
              <div className="analytics-chart-grid">
                <Card
                  title="热门技能"
                  help={`当前 ${data.sample_size} 条岗位中的技能要求分布 · 前 ${Math.min(10, data.skill_frequency.length)} 项`}
                >
                  <ul id="analytics-skills" className="analytics-bars">
                    {data.skill_frequency.slice(0, 10).map((row) => (
                      <li key={row.skill}>
                        <div className="analytics-bar-label">
                          <span>{row.skill}</span>
                          <span>
                            {row.job_count} 条 · {row.share_percent}%
                          </span>
                        </div>
                        <div className="analytics-bar-track" aria-hidden="true">
                          <div
                            className="analytics-bar-fill"
                            style={{ width: `${row.share_percent}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
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
                </Card>
                <div className="analytics-side">
                  <details className="analytics-cloud-panel" open>
                    <summary>热门技能词云</summary>
                    <Card
                      title="技能词云"
                      help={`字号随包含该技能的岗位数量变化 · 前 ${Math.min(30, data.skill_frequency.length)} 项`}
                    >
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
                    </Card>
                  </details>
                  <section className="analytics-insight">
                    <h3>如何理解这份分布</h3>
                    <p>
                      同一岗位可能要求多种技能，比例不相加。样本数量有限，请结合目标岗位选择学习重点。
                    </p>
                  </section>
                </div>
              </div>
              <Card
                id="analytics-salary"
                title="岗位薪资分布"
                help="原始招聘区间 · 按币种与周期分组"
              >
                {!data.salary_groups.length && (
                  <p className="analytics-empty-salary">
                    数据不足：当前样本没有可比较的薪资区间，不生成推测分布。
                  </p>
                )}
                {data.salary_groups.map((group) => {
                  const max = Math.max(0, ...group.ranges.map((row) => row.upper));
                  const scale = max || 1;
                  return (
                    <section
                      className="analytics-salary-group"
                      key={`${group.currency}/${group.period}`}
                      data-currency={group.currency}
                      data-period={group.period}
                    >
                      <h3>
                        {group.currency} / {periods[group.period] || group.period} ·{' '}
                        {group.sample_size} 条
                      </h3>
                      <div className="analytics-salary-axis">
                        <span>0</span>
                        <span>{number(max)}</span>
                      </div>
                      {group.ranges.map((row) => (
                        <div className="analytics-salary-row" key={row.jd_id}>
                          <div className="analytics-bar-label">
                            <span>{row.title}</span>
                            <span>
                              {number(row.lower)}–{number(row.upper)}
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
              </Card>
              <Card id="analytics-observations" title="样本观察与使用边界">
                <ul>
                  {data.observations.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </Card>
              <Card
                id="analytics-sources"
                title="岗位与来源明细"
                help="统计单位是已保存岗位记录；重复手动录入分别计数，固定快照导入会去重。来源标签来自录入资料，不等于独立事实核验。"
              >
                <details className="analytics-details">
                  <summary>查看 {data.jobs.length} 条岗位来源</summary>
                  <Table
                    headers={['岗位 / 雇主', '已确认或解析的技能', '来源与采集日期', '薪资状态']}
                    rows={data.jobs.map((job) => [
                      <>
                        <strong>{job.title}</strong>
                        <small>{job.company || '雇主未知'}</small>
                      </>,
                      job.skills.join('、') || '未识别 / 未确认',
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
              </Card>
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
  if (!s) return <p role="status">正在读取市场洞察…</p>;
  const c = controller.current!;
  return (
    <div className="analytics-page" data-module="analytics">
      <PageHeading eyebrow="辅助决策 / 样本视角" title="市场洞察">
        从已录入岗位了解技能需求与薪资区间，为求职方向提供参考。
      </PageHeading>
      <details id="analytics-filters" className="analytics-filter-panel">
        <summary>筛选来源与日期</summary>
        <form
          className="card analytics-filters"
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
      <details className="analytics-library">
        <summary>演示数据 / 数据管理</summary>
        <p>
          导入 2026 年 9 月 8 日采集的 5 份 Canonical
          招聘快照。均来自同一雇主，薪资未披露；不能代表整个就业市场，也不代表岗位现在仍开放。
        </p>
        <Button
          id="analytics-import"
          disabled={Boolean(s.busy)}
          onClick={async () => {
            await c.importSamples();
            setFilters(initialFilters());
          }}
        >
          导入 5 份真实岗位 快照
        </Button>
      </details>
    </div>
  );
}
