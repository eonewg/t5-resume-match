import {userText} from '../../core/presentation.js';
import {connectAnalytics} from './controller.js';

const sourceLabels = {real: '真实采样', course: '课程样本', synthetic: '合成演示', unknown: '来源暂未提供'};
const periodLabels = {hour: '小时', day: '日', month: '月', year: '年'};
const number = value => new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2}).format(value);

export function mount(container, context) {
  const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag); element.textContent = userText(text); element.className = className; return element;
  };
  const style = node('link'); style.rel = 'stylesheet'; style.href = new URL('./styles.css', import.meta.url).href;
  const header = node('div'); header.append(node('p', '从已录入岗位出发', 'eyebrow'), node('h1', '市场洞察'),
    node('p', '查看样本中的技能要求与薪资区间。先看来源和样本量，再解释分布。', 'analytics-lead'));
  const form = node('form', '', 'card analytics-filters');
  const source = node('select'); source.id = 'analytics-source';
  for (const [value, label] of [['real', '真实采样'], ['', '全部来源'], ['course', '课程样本'], ['synthetic', '合成演示'], ['unknown', '来源暂未提供']]) {
    const option = node('option', label); option.value = value; source.append(option);
  }
  const start = node('input'); start.type = 'date'; start.id = 'analytics-from';
  const end = node('input'); end.type = 'date'; end.id = 'analytics-to';
  for (const [labelText, field] of [['数据来源', source], ['采集日期 · 起', start], ['采集日期 · 止', end]]) {
    const group = node('div'); const label = node('label', labelText); label.htmlFor = field.id; group.append(label, field); form.append(group);
  }
  const apply = node('button', '更新分析', 'button primary'); apply.type = 'submit'; form.append(apply);
  const library = node('details', '', 'analytics-library');
  library.append(node('summary', '使用已归档的真实岗位'));
  library.append(node('p', '导入 2026 年 9 月 8 日采集的 5 份 Canonical 招聘快照。均来自同一雇主，薪资未披露；不能代表整个就业市场，也不代表岗位现在仍开放。'));
  const importButton = node('button', '导入 5 份真实岗位 快照', 'button secondary'); importButton.type = 'button'; importButton.id = 'analytics-import'; library.append(importButton);
  const status = node('p', '', 'analytics-status'); status.id = 'analytics-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const body = node('div'); body.id = 'analytics-results';
  container.className = 'analytics-page'; container.replaceChildren(style, header, form, library, status, body);

  function table(headers, rows, className = '') {
    const wrapper = node('div', '', 'analytics-table-scroll'); wrapper.tabIndex = 0;
    const element = node('table', '', className); const head = node('thead'); const headerRow = node('tr');
    for (const title of headers) { const th = node('th', title); th.scope = 'col'; headerRow.append(th); }
    head.append(headerRow); const tbody = node('tbody');
    for (const values of rows) {
      const row = node('tr');
      for (const value of values) { const td = node('td'); typeof value === 'string' ? td.textContent = value : td.append(value); row.append(td); }
      tbody.append(row);
    }
    element.append(head, tbody); wrapper.append(element); return wrapper;
  }
  function card(title, help = '') {
    const result = node('section', '', 'card analytics-card'); result.append(node('h2', title));
    if (help) result.append(node('p', help, 'analytics-help')); return result;
  }
  function renderResult(result) {
    body.replaceChildren();
    if (!result) return;
    if (result.is_mock) body.append(node('p', '当前分析包含演示服务或演示输入，请勿用于真实市场结论。', 'notice'));
    const data = result.market;
    if (!data) { body.append(node('p', '当前分析模块未提供完整市场指标，请联系维护者检查分析服务。', 'notice')); return; }
    const metrics = node('div', '', 'analytics-metrics');
    const unknown = data.salary_coverage.missing_range_count + data.salary_coverage.missing_unit_count;
    for (const [value, title, detail] of [
      [data.sample_size, '岗位样本', `当前筛选 / 已录入 ${result.scope?.available_count ?? data.sample_size} 条`],
      [data.skill_frequency.length, '技能 / 工具', '按 岗位 去重计数，工具也计入能力要求'],
      [data.salary_coverage.comparable_count, '可比较薪资', `未知或单位不明 ${unknown} 条`],
    ]) {
      const metric = node('article', '', 'card analytics-metric'); metric.append(node('p', title), node('strong', String(value)), node('small', detail)); metrics.append(metric);
    }
    metrics.id = 'analytics-metrics'; body.append(metrics);
    const sourceText = Object.entries(data.source_counts).filter(([,count]) => count).map(([key,count]) => `${sourceLabels[key] || key} ${count}`).join(' · ');
    const dateText = data.collected_from ? `${data.collected_from} 至 ${data.collected_to}` : '未知';
    const scope = node('p', `来源：${sourceText || '暂无'}。采集日期：${dateText}；无日期 ${data.undated_count} 条。已知雇主 ${data.company_count} 家。`, 'analytics-scope');
    scope.id = 'analytics-scope'; body.append(scope);
    if (result.scope?.excluded_mock_count) body.append(node('p', `已排除 ${result.scope.excluded_mock_count} 条标记为演示数据的记录。`, 'analytics-help'));
    if (!data.sample_size) {
      const empty = card('还没有可分析的岗位'); empty.id = 'analytics-empty';
      empty.append(node('p', result.summary), node('p', '可以展开上方快照入口导入真实岗位，或切换到“全部来源”查看手动录入的岗位。'));
      body.append(empty); return;
    }
    const chartGrid = node('div', '', 'analytics-chart-grid');
    const cloud = card('技能词云', `字号随出现该技能的 岗位 数量变化。展示前 ${Math.min(30, data.skill_frequency.length)} 项。`);
    const cloudList = node('ul', '', 'analytics-cloud'); cloudList.id = 'analytics-cloud';
    const maximum = data.skill_frequency[0]?.job_count || 1;
    for (const row of data.skill_frequency.slice(0, 30)) {
      const item = node('li', '', 'analytics-cloud-word');
      item.style.fontSize = `${14 + 17 * row.job_count / maximum}px`;
      item.append(node('span', row.skill), node('small', `${row.job_count} 条`));
      item.title = `${row.skill}：${row.job_count}/${data.sample_size} 条 岗位，${row.share_percent}%`; cloudList.append(item);
    }
    cloud.append(cloudList);
    if (!data.skill_frequency.length) cloud.append(node('p', '尚无已识别或确认的技能关键词。'));
    const frequency = card('技能要求分布', `分母为当前 ${data.sample_size} 条 岗位。同一岗位可要求多种技能；展示前 ${Math.min(15, data.skill_frequency.length)} 项。`);
    const bars = node('ul', '', 'analytics-bars'); bars.id = 'analytics-skills';
    for (const row of data.skill_frequency.slice(0, 15)) {
      const item = node('li'); const label = node('div', '', 'analytics-bar-label');
      label.append(node('span', row.skill), node('span', `${row.job_count} 条 · ${row.share_percent}%`));
      const track = node('div', '', 'analytics-bar-track'); const fill = node('div', '', 'analytics-bar-fill');
      fill.style.width = `${row.share_percent}%`; track.setAttribute('aria-hidden', 'true'); track.append(fill); item.append(label, track); bars.append(item);
    }
    frequency.append(bars);
    const allSkills = node('details', '', 'analytics-details'); allSkills.append(node('summary', `查看全部 ${data.skill_frequency.length} 项技能频率`));
    allSkills.append(table(['技能 / 工具', '岗位数量', '占样本比例'], data.skill_frequency.map(row => [row.skill, String(row.job_count), `${row.share_percent}%`])));
    frequency.append(allSkills); const cloudDisclosure = node('details'); cloudDisclosure.append(node('summary', '查看热门技能词云'), cloud); chartGrid.append(frequency, cloudDisclosure); body.append(chartGrid);

    const salary = card('岗位薪资分布', '展示原始招聘区间，分组内从 0 起画；不同币种、周期各用独立刻度，不求跨组平均值。'); salary.id = 'analytics-salary';
    const coverage = node('p', `没有完整区间 ${data.salary_coverage.missing_range_count} 条；币种/周期未确认或不支持 ${data.salary_coverage.missing_unit_count} 条。这些记录仍参与技能统计，不以零薪资进入下图。`, 'analytics-help'); salary.append(coverage);
    if (!data.salary_groups.length) salary.append(node('p', '当前样本没有可比较的薪资区间。薪资暂未提供，不生成推测分布。', 'analytics-empty-salary'));
    for (const group of data.salary_groups) {
      const section = node('section', '', 'analytics-salary-group'); section.dataset.currency = group.currency; section.dataset.period = group.period;
      section.append(node('h3', `${group.currency} / ${periodLabels[group.period] || group.period} · ${group.sample_size} 条`));
      const max = Math.max(...group.ranges.map(row => row.upper));
      const scale = max || 1;
      const axis = node('div', '', 'analytics-salary-axis'); axis.append(node('span', '0'), node('span', number(max))); section.append(axis);
      for (const row of group.ranges) {
        const item = node('div', '', 'analytics-salary-row');
        const label = node('div', '', 'analytics-bar-label'); label.append(node('span', row.title), node('span', `${number(row.lower)}–${number(row.upper)}`));
        const track = node('div', '', 'analytics-salary-track'); track.setAttribute('aria-hidden', 'true');
        const range = node('span', '', 'analytics-salary-range' + (row.lower === row.upper ? ' is-point' : ''));
        range.style.left = `${row.lower / scale * 100}%`; range.style.width = `${(row.upper - row.lower) / scale * 100}%`;
        track.append(range); item.append(label, track); section.append(item);
      }
      salary.append(section);
    }
    body.append(salary);
    const sourceCard = card('岗位与来源明细', '统计单位是已保存 岗位 记录；重复手动录入会分别计数。固定快照导入会去重。来源标签来自录入资料，不等于独立事实核验。');
    sourceCard.id = 'analytics-sources';
    sourceCard.append(table(['岗位 / 雇主', '已确认或解析的技能', '来源与采集日期', '薪资状态'], data.jobs.map(job => {
      const title = node('div'); title.append(node('strong', job.title), node('small', job.company || '雇主未知'));
      const provenance = node('div'); provenance.append(node('span', sourceLabels[job.source_type] || job.source_type));
      if (job.source_url) {
        try {
          const url = new URL(job.source_url);
          if (['http:', 'https:'].includes(url.protocol)) {
            const link = node('a', job.source_name || '查看来源'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; provenance.append(link);
          }
        } catch { /* Invalid URLs are displayed as unavailable, never as executable links. */ }
      }
      provenance.append(node('small', job.collected_at || '采集日期未知'));
      const salaryText = {comparable: '已进入对应分组', missing_range: '暂未提供完整区间', missing_unit: '暂未提供薪资单位'}[job.salary_status];
      return [title, job.skills.join('、') || '未识别 / 未确认', provenance, salaryText];
    })));
    body.append(sourceCard);
    const observations = card('样本观察与使用边界'); observations.id = 'analytics-observations';
    const list = node('ul'); for (const text of data.observations) list.append(node('li', text)); observations.append(list); body.append(observations);
  }
  const controller = connectAnalytics(context, state => {
    source.value = state.filters.source_type; start.value = state.filters.date_from; end.value = state.filters.date_to;
    for (const field of [source, start, end, apply, importButton]) field.disabled = Boolean(state.busy);
    status.textContent = userText(state.error || state.notice || (state.busy === 'import' ? '正在导入真实快照…' : state.busy ? '正在计算当前筛选…' : '已更新。'));
    status.dataset.error = String(Boolean(state.error));
    body.setAttribute('aria-busy', String(Boolean(state.busy))); renderResult(state.result);
  });
  form.addEventListener('submit', event => { event.preventDefault(); controller.load({source_type: source.value, date_from: start.value, date_to: end.value}); });
  importButton.addEventListener('click', controller.importSamples);
  controller.load();
  return () => {controller.dispose(); style.remove();};
}
