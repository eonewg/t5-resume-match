import {connectJobs} from './controller.js';

export function mount(container, context) {
  const node = (tag, text = '') => { const e = document.createElement(tag); e.textContent = text; return e; };
  const style = node('link'); style.rel = 'stylesheet'; style.href = new URL('./styles.css', import.meta.url).href;
  const title = node('input'); title.id = 'jobs-title'; title.maxLength = 200; title.required = true;
  const company = node('input'); company.id = 'jobs-company';
  const raw = node('textarea'); raw.id = 'jobs-text'; raw.maxLength = 50000; raw.required = true;
  const form = node('form');
  for (const [text, field] of [['岗位名称',title],['公司（可选）',company],['JD 原文',raw]]) {
    const label = node('label',text); label.htmlFor = field.id; form.append(label, field);
  }
  const save = node('button','解析并保存 JD'); save.className = 'button primary'; form.append(save);
  const refresh = node('button','刷新已保存记录'); refresh.className = 'button secondary';
  const resume = node('select'); resume.id = 'jobs-resume';
  const jobs = node('select'); jobs.id = 'jobs-select';
  const selectPanel = node('section');
  for (const [text, field] of [['选择已保存简历',resume],['选择已保存 JD',jobs]]) {
    const label = node('label',text); label.htmlFor = field.id; selectPanel.append(label, field);
  }
  const parsed = node('p'); parsed.id = 'jobs-keywords';
  const original = node('details'); original.append(node('summary','查看 JD 原文'));
  const originalText = node('p'); originalText.id = 'jobs-original'; original.append(originalText);
  const run = node('button','计算关键词匹配'); run.className = 'button primary';
  selectPanel.append(parsed, original, run);
  const mode = node('p'); mode.id = 'jobs-mode';
  const status = node('p'); status.id = 'jobs-status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const results = node('section'); results.id = 'jobs-result'; results.hidden = true;
  const grid = node('div'); grid.className = 'jobs-grid'; grid.append(form, selectPanel);
  const back = node('a','返回工作台保存/编辑简历'); back.href = '#workspace';
  container.className = 'card';
  container.replaceChildren(style,node('h1','岗位与关键词匹配'),node('p','先保存 JD，再选择简历，查看技能与工具覆盖情况。'),back,mode,refresh,grid,status,results);
  function options(select, rows, value, label) {
    const empty = node('option',label); empty.value = ''; select.replaceChildren(empty);
    for (const row of rows) { const option = node('option',row.title || row.name || row.id); option.value = row.id; select.append(option); }
    select.value = value;
  }
  const controller = connectJobs(context, state => {
    options(jobs,state.jobs,state.jdId,'请选择 JD'); options(resume,state.resumes,state.resumeId,'请选择简历');
    for (const field of [save,refresh,run,resume,jobs]) field.disabled = state.busy;
    for (const field of [title,company,raw]) field.readOnly = state.busy;
    mode.textContent = state.jobMock === true ? 'Mock 演示模式：不代表真实解析或评分。' : state.jobMock === false
      ? '关键词规则模式 · 未启用 embedding' : '服务模式尚未确认。';
    status.textContent = state.error || (state.busy ? '正在处理…' : state.notice);
    status.dataset.error = String(Boolean(state.error));
    const job = state.jobs.find(x => x.id === state.jdId);
    parsed.textContent = job ? '技能/工具关键词：' + (job.skills.join('、') || '无可识别关键词') : '选择 JD 后显示解析结果。';
    originalText.textContent = job?.jd_text || '';
    results.replaceChildren(); results.hidden = !state.result;
    if (!state.result) return;
    const r = state.result;
    const assessed = r.matched_skills.length + r.missing_skills.length > 0;
    results.append(node('h2',r.is_mock ? '— · Mock 匹配结果' : assessed ? `${r.score}% · 关键词覆盖率` : '— · 无法有效评估'));
    for (const [label, values] of [['已匹配技能/工具',r.matched_skills],['缺失技能 / gap',r.missing_skills],['评分依据',r.gap_analysis]]) {
      results.append(node('h3',label)); const list = node('ul');
      for (const value of values.length ? values : ['无']) list.append(node('li',value)); results.append(list);
    }
  });
  const onSubmit = event => {event.preventDefault(); controller.create({title:title.value, company:company.value || null, jd_text:raw.value});};
  const onResume = () => controller.choose('resumeId',resume.value);
  const onJob = () => controller.choose('jdId',jobs.value);
  form.addEventListener('submit',onSubmit); refresh.addEventListener('click',controller.load);
  run.addEventListener('click',controller.match); resume.addEventListener('change',onResume); jobs.addEventListener('change',onJob);
  controller.load();
  return () => {controller.dispose(); style.remove(); form.removeEventListener('submit',onSubmit);
    refresh.removeEventListener('click',controller.load); run.removeEventListener('click',controller.match);
    resume.removeEventListener('change',onResume); jobs.removeEventListener('change',onJob);};
}
