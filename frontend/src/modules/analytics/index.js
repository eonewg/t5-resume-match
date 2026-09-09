import {userText} from '../../core/presentation.js';
import {connectAnalytics} from './controller.js';
import {setFeedback} from '../../core/ui.js';

const sourceLabels = {real: '真实采样', course: '课程样本', synthetic: '合成演示', unknown: '来源暂未提供'};
const periodLabels = {hour: '小时', day: '日', month: '月', year: '年'};
const number = value => new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2}).format(value);

export function mount(container, context) {
  const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag); element.textContent = userText(text); element.className = className; return element;
  };
  const style = node('link'); style.rel = 'stylesheet'; style.href = new URL('./styles.css', import.meta.url).href;
  const header = node('div'); header.append(node('p', '05 / 了解市场', 'eyebrow'), node('h1', '市场洞察'),
    node('p', '从已录入的岗位，了解技能需求与薪资区间。', 'analytics-lead'));
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
  const apply = node('button', '应用筛选', 'button secondary'); apply.type = 'submit'; form.append(apply);
  const filters = node('details', '', 'analytics-filter-panel'); filters.id = 'analytics-filters';
  filters.append(node('summary', '筛选来源与日期'), form);
  const library = node('details', '', 'analytics-library');
  library.append(node('summary', '演示数据 / 数据管理'));
  library.append(node('p', '导入 2026 年 9 月 8 日采集的 5 份 Canonical 招聘快照。均来自同一雇主，薪资未披露；不能代表整个就业市场，也不代表岗位现在仍开放。'));
  const importButton = node('button', '导入 5 份真实岗位 快照', 'button secondary'); importButton.type = 'button'; importButton.id = 'analytics-import'; library.append(importButton);
  const status = node('p', '', 'analytics-status feedback'); status.id = 'analytics-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const body = node('div'); body.id = 'analytics-results';
  container.className = 'analytics-page'; container.replaceChildren(style, header, filters, status, body, library);

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
    if (result.is_mock) {
      const mode = node('details', '', 'helper-disclosure');
      mode.append(node('summary', '演示数据'), node('p', '当前分析包含演示服务或演示输入，请勿用于真实市场结论。'));
      body.append(mode);
    }
    const data = result.market;
    if (!data) { body.append(node('p', '当前分析模块未提供完整市场指标，请联系维护者检查分析服务。', 'notice')); return; }
    const metrics = node('div', '', 'analytics-metrics');
    const unknown = data.salary_coverage.missing_range_count + data.salary_coverage.missing_unit_count;
    for (const [value, title, detail] of [
      [data.sample_size, '岗位样本', `当前筛选 / 已录入 ${result.scope?.available_count ?? data.sample_size} 条`],
      [data.company_count, '已知雇主', '按当前样本中的公司计数'],
      [data.skill_frequency[0]?.skill || '暂无', '热门技能', `共 ${data.skill_frequency.length} 项技能 / 工具`],
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
      const next = node('a', '添加目标岗位', 'button primary'); next.href = '#jobs';
      empty.append(node('p', result.summary), node('p', '添加岗位后即可了解技能需求；已有岗位可在筛选中选择“全部来源”。'), next);
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
    const frequency = card('热门技能', `当前 ${data.sample_size} 条岗位中的技能要求分布 · 前 ${Math.min(10, data.skill_frequency.length)} 项`);
    const bars = node('ul', '', 'analytics-bars'); bars.id = 'analytics-skills';
    for (const row of data.skill_frequency.slice(0, 10)) {
      const item = node('li'); const label = node('div', '', 'analytics-bar-label');
      label.append(node('span', row.skill), node('span', `${row.job_count} 条 · ${row.share_percent}%`));
      const track = node('div', '', 'analytics-bar-track'); const fill = node('div', '', 'analytics-bar-fill');
      fill.style.width = `${row.share_percent}%`; track.setAttribute('aria-hidden', 'true'); track.append(fill); item.append(label, track); bars.append(item);
    }
    frequency.append(bars);
    const allSkills = node('details', '', 'analytics-details'); allSkills.append(node('summary', `查看全部 ${data.skill_frequency.length} 项技能频率`));
    allSkills.append(table(['技能 / 工具', '岗位数量', '占样本比例'], data.skill_frequency.map(row => [row.skill, String(row.job_count), `${row.share_percent}%`])));
    frequency.append(allSkills); const cloudDisclosure = node('details', '', 'analytics-cloud-panel'); cloudDisclosure.open = true;
    cloudDisclosure.append(node('summary', '热门技能词云'), cloud);
    const observationPanel = node('section', '', 'analytics-insight'); observationPanel.append(node('h3', '如何理解这份分布'),node('p', '同一岗位可能要求多种技能，比例不相加。样本数量有限，请结合目标岗位选择学习重点。'));
    const sidebar = node('div', '', 'analytics-side'); sidebar.append(cloudDisclosure, observationPanel);
    chartGrid.append(frequency, sidebar); body.append(chartGrid);

    const salary = card('岗位薪资分布', '原始招聘区间 · 按币种与周期分组'); salary.id = 'analytics-salary';
    const coverage = node('p', `没有完整区间 ${data.salary_coverage.missing_range_count} 条；币种/周期未确认或不支持 ${data.salary_coverage.missing_unit_count} 条。这些记录仍参与技能统计，不以零薪资进入下图。`, 'analytics-help'); salary.append(coverage);
    if (!data.salary_groups.length) salary.append(node('p', '数据不足：当前样本没有可比较的薪资区间，不生成推测分布。', 'analytics-empty-salary'));
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
    const salaryHelp = node('details', '', 'helper-disclosure'); salaryHelp.append(node('summary', '薪资口径与缺失值'),node('p', '分组内从 0 起画，不同币种、周期各用独立刻度，不求跨组平均值。'));salaryHelp.append(coverage);salary.append(salaryHelp);
    body.append(salary);
    const sourceCard = card('岗位与来源明细', '统计单位是已保存 岗位 记录；重复手动录入会分别计数。固定快照导入会去重。来源标签来自录入资料，不等于独立事实核验。');
    sourceCard.id = 'analytics-sources';
    const sourceDetails = node('details', '', 'analytics-details');sourceDetails.append(node('summary', `查看 ${data.jobs.length} 条岗位来源`));
    sourceDetails.append(table(['岗位 / 雇主', '已确认或解析的技能', '来源与采集日期', '薪资状态'], data.jobs.map(job => {
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
    sourceCard.append(sourceDetails);
    const observations = card('样本观察与使用边界'); observations.id = 'analytics-observations';
    const list = node('ul'); for (const text of data.observations) list.append(node('li', text)); observations.append(list); body.append(observations,sourceCard);
  }
  const controller = connectAnalytics(context, state => {
    source.value = state.filters.source_type; start.value = state.filters.date_from; end.value = state.filters.date_to;
    for (const field of [source, start, end, apply, importButton]) field.disabled = Boolean(state.busy);
    status.textContent = userText(state.error || state.notice || (state.busy === 'import' ? '正在导入真实快照…' : state.busy ? '正在整理市场信息…' : ''));
    setFeedback(status, {busy: Boolean(state.busy), error: state.error, success: Boolean(state.result)});
    apply.textContent = state.busy ? '正在更新…' : '应用筛选';
    body.setAttribute('aria-busy', String(Boolean(state.busy))); renderResult(state.result);
  });
  form.addEventListener('submit', event => { event.preventDefault(); controller.load({source_type: source.value, date_from: start.value, date_to: end.value}); });
  importButton.addEventListener('click', controller.importSamples);
  controller.load();
  return () => {controller.dispose(); style.remove();};
}
