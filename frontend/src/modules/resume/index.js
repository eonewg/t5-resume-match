import {connectResume} from './controller.js';

// Keep unsaved edits across in-app navigation, without writing personal text to browser storage.
let retainedDraft = null;

export function mount(container, context) {
  const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
  };
  const button = (text, className = 'button secondary') => {
    const element = node('button', text, className); element.type = 'button'; return element;
  };
  const style = node('link'); style.rel = 'stylesheet'; style.href = new URL('./styles.css', import.meta.url).href;
  const heading = node('div', '', 'section-heading');
  const intro = node('div'); intro.append(node('p', '先确认事实，再开始匹配', 'eyebrow'), node('h1', '简历编辑'));
  const newButton = button('新建简历'); newButton.id = 'resume-new'; heading.append(intro, newButton);
  const description = node('p', '解析只提供草稿。你编辑或确认过的字段会被保护；保存生成新版本，保留历史记录。', 'resume-lead');
  const history = node('section', '', 'card resume-history');
  const historyLabel = node('label', '已保存版本'); historyLabel.htmlFor = 'resume-history';
  const selection = node('select'); selection.id = 'resume-history';
  const load = button('载入所选版本'); load.id = 'resume-load';
  const refresh = button('刷新');
  const previous = button('较新 20 条'); const next = button('更早 20 条');
  history.append(historyLabel, selection, load, refresh, previous, next);

  const grid = node('div', '', 'resume-grid');
  const sourcePanel = node('section', '', 'card resume-source');
  sourcePanel.append(node('h2', '01 · 原始简历'));
  const rawLabel = node('label', '粘贴完整原文'); rawLabel.htmlFor = 'resume-raw';
  const raw = node('textarea'); raw.id = 'resume-raw'; raw.maxLength = 50000; raw.rows = 22;
  raw.placeholder = '粘贴姓名、教育背景、技能和项目 / 工作经历…';
  const count = node('p', '', 'resume-help');
  const parse = button('解析为草稿', 'button primary'); parse.id = 'resume-parse';
  sourcePanel.append(rawLabel, raw, count, parse,
    node('p', '原文会随当前版本保存。只保留明确表达的信息；未识别字段请核对原文后补充。', 'resume-help'));
  const editPanel = node('section', '', 'card resume-fields'); editPanel.append(node('h2', '02 · 核对结构化内容'));
  const inputs = {}, badges = {}, proposals = {}, applyButtons = {};
  const labels = {name: '姓名', education: '教育背景', skills: '技能 / 工具', experience: '项目 / 工作经历'};
  let experienceRows = [];
  const experiences = node('div', '', 'resume-experiences'); experiences.id = 'resume-experiences';
  const addExperience = button('添加一段经历'); addExperience.id = 'resume-add-experience';
  for (const key of Object.keys(labels)) {
    const group = node('section', '', 'resume-field');
    const labelRow = node('div', '', 'resume-label-row');
    const label = node(key === 'experience' ? 'h3' : 'label', labels[key]);
    if (key !== 'experience') label.htmlFor = 'resume-' + key;
    badges[key] = node('span', '待确认', 'resume-field-badge'); labelRow.append(label, badges[key]); group.append(labelRow);
    if (key === 'experience') group.append(experiences, addExperience);
    else {
      const input = node(key === 'name' ? 'input' : 'textarea'); input.id = 'resume-' + key;
      if (key !== 'name') input.rows = key === 'skills' ? 4 : 3;
      inputs[key] = input; group.append(input);
      if (key === 'skills') group.append(node('p', '每行一项，可补充或删除。只填写你确认具备的技能；清空也会保留。', 'resume-help'));
    }
    const suggestion = node('details', '', 'resume-suggestion'); suggestion.id = 'resume-suggestion-' + key;
    const summary = node('summary', '查看新解析建议');
    const content = node('pre'); applyButtons[key] = button('采用这项建议');
    applyButtons[key].dataset.field = key;
    suggestion.append(summary, content, applyButtons[key]); group.append(suggestion);
    proposals[key] = {details: suggestion, content}; editPanel.append(group);
  }
  grid.append(sourcePanel, editPanel);
  const mode = node('p', '', 'notice'); mode.id = 'resume-mode'; mode.hidden = true;
  const status = node('p', '', 'resume-status'); status.id = 'resume-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const confirmLabel = node('label', '', 'resume-confirm');
  const confirm = node('input'); confirm.type = 'checkbox'; confirm.id = 'resume-reviewed';
  confirmLabel.append(confirm, node('span', '我已核对以上结构化内容，未确认的信息保持空白。'));
  const save = button('确认并保存', 'button primary'); save.id = 'resume-save';
  const nextLink = node('a', '前往岗位匹配 →', 'button secondary'); nextLink.href = '#jobs'; nextLink.id = 'resume-next'; nextLink.hidden = true;
  const actions = node('div', '', 'resume-actions'); actions.append(save, nextLink);
  const footer = node('section', '', 'card resume-save-panel'); footer.append(confirmLabel, status, actions);
  container.className = 'resume-editor'; container.replaceChildren(style, heading, description, history, mode, grid, footer);

  let currentState;
  const controller = connectResume(context, state => {
    currentState = state;
    const locked = Boolean(state.busy && state.busy !== 'parse');
    if (raw.value !== state.values.raw_text) raw.value = state.values.raw_text;
    raw.readOnly = locked; count.textContent = `${state.values.raw_text.length} / 50000 字符`;
    for (const key of Object.keys(inputs)) {
      if (inputs[key].value !== state.values[key]) inputs[key].value = state.values[key];
      inputs[key].readOnly = locked;
    }
    if (experienceRows.length !== state.values.experience.length) {
      experienceRows = state.values.experience.map((_, index) => {
        const row = node('div', '', 'resume-experience');
        const label = node('label', `经历 ${index + 1}`); label.htmlFor = `resume-experience-${index}`;
        const input = node('textarea'); input.rows = 5; input.id = label.htmlFor; input.maxLength = 50000;
        const remove = button('删除这段'); remove.setAttribute('aria-label', `删除经历 ${index + 1}`);
        input.addEventListener('input', () => {
          const values = [...currentState.values.experience]; values[index] = input.value; controller.edit('experience', values);
        });
        remove.addEventListener('click', () => controller.edit('experience', currentState.values.experience.filter((_, i) => i !== index)));
        row.append(label, input, remove); return {row, input, remove};
      });
      experiences.replaceChildren(...experienceRows.map(x => x.row));
    }
    experienceRows.forEach(({input, remove}, index) => {
      if (input.value !== state.values.experience[index]) input.value = state.values.experience[index];
      input.readOnly = locked; remove.disabled = locked;
    });
    if (!experienceRows.length) experiences.replaceChildren(node('p', '未填写经历。可根据原文补充，也可以保持空白。', 'resume-help'));
    for (const key of Object.keys(labels)) {
      const protectedField = state.protectedFields.includes(key);
      badges[key].textContent = protectedField ? '已保护' : '待确认'; badges[key].dataset.protected = String(protectedField);
      const differs = state.candidate && JSON.stringify(state.candidate[key]) !== JSON.stringify(state.values[key]);
      proposals[key].details.hidden = !differs;
      if (differs) proposals[key].content.textContent = (Array.isArray(state.candidate[key])
        ? state.candidate[key].join('\n\n') : state.candidate[key]) || '（解析结果为空）';
      applyButtons[key].disabled = Boolean(state.busy);
    }
    const selected = selection.value;
    selection.replaceChildren(node('option', '选择已保存简历…'));
    selection.firstChild.value = '';
    for (const row of state.rows) {
      const option = node('option', `${row.name || '未填写姓名'} · ${row.id.slice(-8)}`); option.value = row.id; selection.append(option);
    }
    selection.value = state.rows.some(x => x.id === selected) ? selected
      : state.rows.some(x => x.id === state.savedId) ? state.savedId : '';
    for (const element of [newButton, selection, load, refresh, parse, confirm]) element.disabled = Boolean(state.busy);
    addExperience.disabled = locked || state.values.experience.length >= 500;
    previous.disabled = Boolean(state.busy) || state.offset === 0;
    next.disabled = Boolean(state.busy) || state.rows.length < 20;
    confirm.checked = state.reviewed;
    save.disabled = Boolean(state.busy) || !state.reviewed || !state.values.raw_text.trim();
    save.textContent = state.busy === 'save' ? '保存并核对中…' : state.pendingSave ? '重试读取已保存版本' : '确认并保存';
    parse.textContent = state.busy === 'parse' ? '正在解析…' : '解析为草稿';
    status.textContent = state.error || state.notice || (state.busy ? '正在读取记录…' : '核对后确认保存，原文和编辑结果会一起保存。');
    status.dataset.error = String(Boolean(state.error));
    mode.hidden = state.parseMock !== true;
    mode.textContent = '当前草稿/记录来自 Mock。请自行核对事实，不把演示字段当作真实解析结果。';
    nextLink.hidden = !state.savedId || state.dirty || Boolean(state.pendingSave);
  }, retainedDraft);
  raw.addEventListener('input', () => controller.edit('raw_text', raw.value));
  for (const key of Object.keys(inputs)) inputs[key].addEventListener('input', () => controller.edit(key, inputs[key].value));
  for (const key of Object.keys(labels)) applyButtons[key].addEventListener('click', () => controller.apply(key));
  parse.addEventListener('click', controller.parse); save.addEventListener('click', controller.save);
  confirm.addEventListener('change', () => controller.review(confirm.checked));
  addExperience.addEventListener('click', () => controller.edit('experience', [...currentState.values.experience, '']));
  refresh.addEventListener('click', () => controller.refresh(0));
  previous.addEventListener('click', () => controller.refresh(Math.max(0, currentState.offset - 20)));
  next.addEventListener('click', () => controller.refresh(currentState.offset + 20));
  load.addEventListener('click', async () => {
    const id = selection.value;
    const result = await controller.load(id);
    if (result?.requiresConfirmation && window.confirm('载入其他版本会替换当前未保存修改。是否继续？')) await controller.load(id, true);
  });
  newButton.addEventListener('click', () => {
    const result = controller.reset();
    if (result?.requiresConfirmation && window.confirm('新建会清空当前未保存修改。是否继续？')) controller.reset(true);
  });
  const beforeUnload = event => { if (currentState?.dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  controller.init();
  return () => { retainedDraft = controller.getDraft(); controller.dispose(); window.removeEventListener('beforeunload', beforeUnload); style.remove(); };
}
