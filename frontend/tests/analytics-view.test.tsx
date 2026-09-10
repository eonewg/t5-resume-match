import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsResult } from '../src/pages/AnalyticsPage';
import type { AnalysisResponse } from '../src/core/contracts';

afterEach(cleanup);

it('opens an overview with all Level 3 outputs based on the same recorded sample', () => {
  const value = result();
  value.market!.skill_frequency = [{ skill: 'SQL', job_count: 1, share_percent: 33.33 }];
  render(
    <MemoryRouter>
      <AnalyticsResult result={value} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('tabpanel').id).toBe('market-panel-overview');
  expect(screen.getByRole('heading', { name: '热门技能词云' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '岗位薪资分布' })).toBeTruthy();
  const matrix = screen.getByRole('region', { name: '各岗位技能要求分布图' });
  expect(within(matrix).getByLabelText('SQL：已识别要求')).toBeTruthy();
  expect(screen.getByRole('heading', { name: '职业规划参考' })).toBeTruthy();
  expect(screen.getByRole('img', { name: /人民币月薪分布/ })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('薪资口径'), { target: { value: 'USD/hour' } });
  expect(screen.getByRole('img', { name: /美元时薪分布/ })).toBeTruthy();
  expect(screen.queryByRole('img', { name: /人民币月薪分布/ })).toBeNull();
});

it('paginates every recorded job in the skill matrix and keeps unrecognized skills explicit', () => {
  const value = result();
  value.market!.skill_frequency = [{ skill: 'SQL', job_count: 1, share_percent: 10 }];
  const original = value.market!.jobs[0];
  value.market!.jobs = Array.from({ length: 10 }, (_, i) => ({
    ...original,
    jd_id: `matrix-${i}`,
    title: `岗位 ${i}`,
    skills: i === 9 ? ['sql'] : [],
  }));
  render(
    <MemoryRouter>
      <AnalyticsResult result={value} />
    </MemoryRouter>,
  );
  const matrix = screen.getByRole('region', { name: '各岗位技能要求分布图' });
  expect(within(matrix).getAllByLabelText('SQL：未识别')).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: '下一组' }));
  expect(within(matrix).getByText('岗位 9')).toBeTruthy();
  expect(within(matrix).getByLabelText('SQL：已识别要求')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox', { name: '查找岗位' }), {
    target: { value: '岗位 9' },
  });
  expect(within(matrix).getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText('1 个岗位 · 第 1 / 1 页')).toBeTruthy();
});
it.each(['overview', 'skills', 'salary', 'jobs', 'unknown'])(
  'opens the requested market topic from the URL: %s',
  (tab) => {
    render(
      <MemoryRouter initialEntries={[`/analytics?tab=${tab}`]}>
        <AnalyticsResult result={result()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tabpanel').id).toBe(
      `market-panel-${tab === 'unknown' ? 'overview' : tab}`,
    );
  },
);
const result = (): AnalysisResponse => ({
  summary: '只描述已录入样本。',
  skills: { SQL: 2 },
  is_mock: false,
  scope: {
    source_type: 'real',
    date_from: null,
    date_to: null,
    available_count: 8,
    selected_count: 3,
    mock_count: 0,
    excluded_mock_count: 1,
  },
  market: {
    sample_size: 3,
    company_count: 1,
    unknown_company_count: 2,
    source_counts: { real: 3 },
    collected_from: '2026-09-01',
    collected_to: '2026-09-03',
    undated_count: 0,
    skill_frequency: Array.from({ length: 12 }, (_, index) => ({
      skill: `技能 ${index + 1}`,
      job_count: 2,
      share_percent: 66.67,
    })),
    jobs: [
      {
        jd_id: 'j1',
        title: '样本岗位',
        company: null,
        skills: ['SQL'],
        salary: null,
        salary_status: 'missing_range',
        source_type: 'real',
        source_url: 'javascript:alert(1)',
        source_name: '不安全来源',
        collected_at: '2026-09-01',
      },
    ],
    salary_coverage: { comparable_count: 2, missing_range_count: 1, missing_unit_count: 0 },
    salary_groups: [
      {
        currency: 'CNY',
        period: 'month',
        sample_size: 1,
        ranges: [{ jd_id: 'j2', title: '月薪样本', lower: 10000, upper: 20000 }],
      },
      {
        currency: 'USD',
        period: 'hour',
        sample_size: 1,
        ranges: [{ jd_id: 'j3', title: '明确的零值', lower: 0, upper: 0 }],
      },
    ],
    observations: ['技能比例可重叠，不相加。'],
  },
});
const show = (value: AnalysisResponse) =>
  render(
    <MemoryRouter initialEntries={['/analytics?tab=skills']}>
      <AnalyticsResult result={value} />
    </MemoryRouter>,
  );

describe('Analytics reading surface', () => {
  it('preserves scope, full skill frequencies, independent salary units, zero values and safe sources', () => {
    show(result());
    expect(document.getElementById('analytics-scope')?.textContent).toContain('真实采样 3');
    expect(document.getElementById('analytics-scope')?.textContent).toContain('2026-09-03');
    expect(screen.getByText(/已排除 1 条/)).toBeTruthy();
    expect(document.querySelectorAll('#analytics-skills > li')).toHaveLength(10);
    expect(document.querySelectorAll('#analytics-cloud > li')).toHaveLength(12);
    const frequencyTable = screen.getByRole('region', {
      name: '技能 / 工具、岗位数量、占样本比例',
      hidden: true,
    });
    expect(frequencyTable.textContent).toContain('技能 12');
    expect(frequencyTable.textContent).toContain('66.67%');
    expect(document.querySelectorAll('.analytics-salary-group')).toHaveLength(1);
    expect(document.querySelector('[data-currency="CNY"]')?.getAttribute('data-period')).toBe(
      'month',
    );
    expect(document.querySelector('.salary-range-details')?.hasAttribute('open')).toBe(false);
    expect(document.querySelector('.salary-comparison')).toBeNull();
    expect(document.getElementById('analytics-sources')?.textContent).toContain('暂未提供完整区间');
    expect(screen.queryByRole('link', { name: '不安全来源', hidden: true })).toBeNull();
  });

  it('offers a next action for an empty sample without drawing an invented distribution', () => {
    const empty = result();
    empty.market = {
      ...empty.market!,
      sample_size: 0,
      skill_frequency: [],
      salary_groups: [],
      jobs: [],
    };
    show(empty);
    expect(screen.getByRole('heading', { name: '还没有可分析的岗位' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '添加目标岗位 →' }).getAttribute('href')).toBe('/jobs');
    expect(document.getElementById('analytics-salary')).toBeNull();
  });

  it('retains the legacy response fallback and its explicit Mock label', () => {
    show({ ...result(), market: null, is_mock: true });
    expect(screen.getByText('Mock · 演示数据，请勿用于真实市场结论')).toBeTruthy();
    expect(screen.getByText('只描述已录入样本。')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'SQL' })).toBeTruthy();
  });
});

it('filters source evidence on skill selection without changing chart denominators', () => {
  const value = result();
  value.market!.jobs[0].skills = ['技能 1'];
  show(value);
  fireEvent.click(screen.getByRole('button', { name: /01技能 1/ }));
  expect(document.querySelector('#analytics-sources details')?.hasAttribute('open')).toBe(true);
  expect(document.querySelector('#analytics-sources')?.textContent).toContain(
    '技能 1 · 1 条相关岗位',
  );
  expect(document.querySelector('#analytics-skills')?.textContent).toContain('66.67%');
  fireEvent.click(screen.getByRole('button', { name: '清除技能筛选' }));
  expect(document.querySelector('#analytics-sources')?.textContent).toContain('共 1 条岗位来源');
});

it('salary groups use separate selectable scales', () => {
  show(result());
  fireEvent.click(screen.getByRole('tab', { name: '薪资分析' }));
  fireEvent.change(screen.getByRole('combobox', { name: '查看哪类薪资' }), {
    target: { value: 'USD/hour' },
  });
  expect(document.querySelector('[data-currency="USD"]')?.hasAttribute('hidden')).toBe(false);
  expect(document.querySelector('[data-currency="CNY"]')).toBeNull();
  expect(document.querySelector('[data-currency="USD"]')?.textContent).toContain('0–0');
  fireEvent.click(screen.getByText(/按岗位方向查看薪资/));
  expect(document.querySelector('[data-currency="USD"] .is-point')).not.toBeNull();
});

it('groups salary directions and draws paginated ranges without checkbox selection', () => {
  const value = result();
  const group = value.market!.salary_groups[0];
  group.ranges = Array.from({ length: 8 }, (_, index) => ({
    jd_id: `dev-${index}`,
    title: `Software Engineer ${index}`,
    lower: index * 1000,
    upper: index * 1000 + 2000,
  }));
  group.ranges.push({ jd_id: 'sales', title: 'Sales Executive', lower: 3000, upper: 4000 });
  group.sample_size = 9;
  show(value);
  fireEvent.click(screen.getByRole('tab', { name: '薪资分析' }));
  fireEvent.click(screen.getByText(/按岗位方向查看薪资/));
  expect(screen.queryByRole('checkbox')).toBeNull();
  const chart = screen.getByRole('region', { name: '研发与技术岗位薪资区间图' });
  expect(chart.querySelectorAll('.analytics-salary-row')).toHaveLength(6);
  const scale = chart.querySelector('.analytics-salary-axis')!.textContent;
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(chart.querySelectorAll('.analytics-salary-row')).toHaveLength(2);
  expect(chart.querySelector('.analytics-salary-axis')!.textContent).toBe(scale);
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索当前方向' }), {
    target: { value: 'Engineer 7' },
  });
  expect(chart.querySelectorAll('.analytics-salary-row')).toHaveLength(1);
  expect(chart.querySelector('.analytics-salary-axis')!.textContent).toBe(scale);
  fireEvent.click(screen.getByRole('button', { name: /销售与市场/ }));
  expect(screen.getByRole('region', { name: '销售与市场岗位薪资区间图' }).textContent).toContain(
    'Sales Executive',
  );
  expect(screen.queryByRole('region', { name: '研发与技术岗位薪资区间图' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索当前方向' }), {
    target: { value: '不存在' },
  });
  expect(screen.getByText(/当前方向没有找到/)).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: '查看哪类薪资' }), {
    target: { value: 'USD/hour' },
  });
  expect(document.querySelector('.salary-range-details')?.hasAttribute('open')).toBe(false);
});

it('salary histogram counts each selected interval once and labels its midpoint basis', () => {
  show(result());
  fireEvent.click(screen.getByRole('tab', { name: '薪资分析' }));
  const chart = screen.getByRole('img', { name: /人民币月薪分布/ });
  const counts = Array.from(chart.querySelectorAll('title')).map((node) =>
    Number(/：(\d+) 个岗位/.exec(node.textContent || '')![1]),
  );
  expect(counts.reduce((sum, value) => sum + value, 0)).toBe(1);
  expect(screen.getByText(/不是实际到手收入/)).toBeTruthy();
});

it('shows only one full topic and supports keyboard tab navigation', () => {
  show(result());
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  expect(screen.getByRole('tabpanel').id).toBe('market-panel-skills');
  fireEvent.keyDown(screen.getByRole('tab', { name: '技能需求' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tabpanel').id).toBe('market-panel-salary');
  expect(document.querySelector('.salary-comparison')).toBeNull();
  fireEvent.keyDown(screen.getByRole('tab', { name: '薪资分析' }), { key: 'End' });
  expect(screen.getByRole('tabpanel').id).toBe('market-panel-jobs');
});
