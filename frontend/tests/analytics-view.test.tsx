import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsResult } from '../src/pages/AnalyticsPage';
import type { AnalysisResponse } from '../src/core/contracts';

afterEach(cleanup);
it.each(['skills', 'salary', 'jobs', 'unknown'])(
  'opens the requested market topic from the URL: %s',
  (tab) => {
    render(
      <MemoryRouter initialEntries={[`/analytics?tab=${tab}`]}>
        <AnalyticsResult result={result()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tabpanel').id).toBe(
      `market-panel-${tab === 'unknown' ? 'skills' : tab}`,
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
    <MemoryRouter>
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
    expect(document.querySelectorAll('.analytics-salary-group')).toHaveLength(2);
    expect(document.querySelector('[data-currency="CNY"]')?.getAttribute('data-period')).toBe(
      'month',
    );
    expect(document.querySelector('[data-currency="USD"]')?.textContent).toContain('0–0');
    expect(document.querySelector('[data-currency="USD"] .is-point')).not.toBeNull();
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
  fireEvent.change(screen.getByRole('combobox', { name: '薪资口径' }), {
    target: { value: 'USD/hour' },
  });
  expect(document.querySelector('[data-currency="USD"]')?.hasAttribute('hidden')).toBe(false);
  expect(document.querySelector('[data-currency="CNY"]')?.hasAttribute('hidden')).toBe(true);
  expect(document.querySelector('[data-currency="USD"]')?.textContent).toContain('0–0');
});

it('salary histogram counts each selected interval once and labels its midpoint basis', () => {
  show(result());
  fireEvent.click(screen.getByRole('tab', { name: '薪资分析' }));
  const chart = screen.getByRole('img', { name: /CNY 每月薪资区间中点分布/ });
  const counts = Array.from(chart.querySelectorAll('title')).map((node) =>
    Number(/：(\d+) 条/.exec(node.textContent || '')![1]),
  );
  expect(counts.reduce((sum, value) => sum + value, 0)).toBe(1);
  expect(screen.getByText(/非实际到手薪资/)).toBeTruthy();
});

it('shows only one full topic and supports keyboard tab navigation', () => {
  show(result());
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  expect(screen.getByRole('tabpanel').id).toBe('market-panel-skills');
  fireEvent.keyDown(screen.getByRole('tab', { name: '技能需求' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tabpanel').id).toBe('market-panel-salary');
  expect(
    document.querySelector('[data-currency="CNY"] .analytics-salary-axis')?.children,
  ).toHaveLength(5);
  fireEvent.keyDown(screen.getByRole('tab', { name: '薪资分析' }), { key: 'End' });
  expect(screen.getByRole('tabpanel').id).toBe('market-panel-jobs');
});
