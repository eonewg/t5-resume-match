import { useState } from 'react';
import type { SalaryGroup } from '../core/contracts';
import { Button } from './ui';

// Navigation groups inferred only from the displayed title; never saved as JD facts.
export function salaryDirection(title: string) {
  if (
    /数据|气象|算法|机器学习|人工智能|\b(data|analytics|machine learning|scientist|ai|ml)\b/i.test(
      title,
    )
  )
    return '数据与算法';
  if (
    /销售|市场|商务|客户|\b(sales|marketing|account executive|business development)\b/i.test(title)
  )
    return '销售与市场';
  if (/产品|设计|\b(product|design|ux|ui)\b/i.test(title)) return '产品与设计';
  if (
    /开发|研发|软件|运维|安全|测试|\b(software|developer|backend|frontend|full.?stack|devops|security|qa|engineer|python|java)\b/i.test(
      title,
    )
  )
    return '研发与技术';
  if (
    /运营|财务|采购|人事|项目|\b(operations|finance|financial|procurement|human resources|recruit|program|project|support)\b/i.test(
      title,
    )
  )
    return '运营与职能';
  return '其他岗位';
}
const number = (value: number) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);

export default function SalaryDetails({ group, label }: { group: SalaryGroup; label: string }) {
  const [direction, setDirection] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('upper');
  const [page, setPage] = useState(0);
  const groups = new Map<string, SalaryGroup['ranges']>();
  for (const row of group.ranges) {
    const key = salaryDirection(row.title);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const options = [...groups].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-CN'),
  );
  const currentDirection = groups.has(direction) ? direction : options[0]?.[0] || '';
  const sameDirection = groups.get(currentDirection) || [];
  const matches = sameDirection.filter((row) =>
    row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  if (sort === 'upper') matches.sort((a, b) => b.upper - a.upper);
  if (sort === 'lower') matches.sort((a, b) => b.lower - a.lower);
  if (sort === 'name') matches.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  const pages = Math.max(1, Math.ceil(matches.length / 6));
  const currentPage = Math.min(page, pages - 1);
  const rows = matches.slice(currentPage * 6, currentPage * 6 + 6);
  // Stable scale across search/pagination within a direction and salary unit.
  const maximum = Math.max(1, ...sameDirection.map((row) => row.upper));
  return (
    <details className="analytics-details salary-range-details">
      <summary>按岗位方向查看薪资 · {group.ranges.length} 个岗位</summary>
      <section
        className="analytics-salary-group"
        data-currency={group.currency}
        data-period={group.period}
      >
        <h3>{label}</h3>
        <div className="salary-direction-options" aria-label="岗位方向">
          {options.map(([key, records]) => (
            <Button
              key={key}
              aria-pressed={key === currentDirection}
              onClick={() => {
                setDirection(key);
                setQuery('');
                setPage(0);
              }}
            >
              {key}
              <span>{records.length}</span>
            </Button>
          ))}
        </div>
        <p className="analytics-help">
          按岗位名称粗分，供浏览使用；资历和职责仍以各岗位为准。每页直接展示 6 个区间，无需勾选。
        </p>
        <div className="salary-detail-controls">
          <label>
            搜索当前方向
            <input
              type="search"
              value={query}
              placeholder="输入岗位名称"
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            排列顺序
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="upper">薪资上限从高到低</option>
              <option value="lower">薪资下限从高到低</option>
              <option value="name">岗位名称</option>
              <option value="original">录入顺序</option>
            </select>
          </label>
        </div>
        {rows.length ? (
          <section
            className="salary-direction-chart"
            aria-label={`${currentDirection}岗位薪资区间图`}
          >
            <p className="salary-range-legend">
              蓝线左端为下限，右端为上限；固定金额为圆点。同方向翻页时刻度保持一致。
            </p>
            <div className="analytics-salary-axis">
              {[0, 1, 2, 3, 4].map((tick) => (
                <span key={tick} style={{ left: `${tick * 25}%` }}>
                  {number((maximum * tick) / 4)}
                </span>
              ))}
            </div>
            {rows.map((row) => (
              <div className="analytics-salary-row" key={row.jd_id}>
                <div className="analytics-bar-label">
                  <span>{row.title}</span>
                  <strong>
                    {number(row.lower)}–{number(row.upper)}
                  </strong>
                </div>
                <div className="analytics-salary-track" aria-hidden="true">
                  <span
                    className={`analytics-salary-range ${row.lower === row.upper ? 'is-point' : ''}`}
                    style={{
                      left: `${(row.lower / maximum) * 100}%`,
                      width: `${((row.upper - row.lower) / maximum) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        ) : (
          <p role="status">当前方向没有找到对应岗位，试试其他关键词或切换方向。</p>
        )}
        <div className="salary-detail-pagination">
          <span>
            {currentDirection} · 共 {matches.length} 个岗位 · 第 {currentPage + 1} / {pages} 页
          </span>
          <Button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
            上一页
          </Button>
          <Button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
            下一页
          </Button>
        </div>
      </section>
    </details>
  );
}
