import demoResume from '../../demo/fixtures/resume-zh.js';
import {userText} from '../../core/presentation.js';
import {connectResume} from './controller.js';
import {fieldStatus, renderChips, setFeedback} from '../../core/ui.js';

// Keep unsaved edits across in-app navigation, without writing personal text to browser storage.
let retainedDraft = null;

export function mount(container, context) {
  const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag); element.textContent = userText(text); element.className = className; return element;
  };
  const button = (text, className = 'button secondary') => {
    const element = node('button', text, className); element.type = 'button'; return element;
  };
  const style = node('link'); style.rel = 'stylesheet'; style.href = new URL('./styles.css', import.meta.url).href;
  const heading = node('div', '', 'section-heading');
  const intro = node('div'); intro.append(node('p', '01 / 求职准备', 'eyebrow'), node('h1', '我的简历'));
  const history = node('details', '', 'resume-history'); history.id = 'resume-history';
  history.append(node('summary', '历史简历'));
  const historyList = node('div', '', 'resume-history-list');
  const historyRetry = button('重试读取历史简历', 'button ghost'); historyRetry.hidden = true;
  const newButton = button('导入另一份简历', 'button ghost'); newButton.id = 'resume-new';
  const previous = button('较新的简历'); const next = button('更早的简历');
  history.append(historyList, historyRetry, previous, next, newButton); heading.append(intro, history);
  const description = node('p', '导入简历，核对内容后即可选择目标岗位。', 'resume-lead');
  const importer = node('section', '', 'resume-import');
  const dropzone = button('', 'resume-dropzone'); dropzone.id = 'resume-dropzone';
  dropzone.append(node('span', '上传简历', 'resume-upload-title'), node('span', '拖入简历，或点击选择文件'), node('small', 'PDF / DOCX / TXT · 最大 10 MB'));
  const file = node('input'); file.type = 'file'; file.id = 'resume-file'; file.accept = '.pdf,.docx,.txt'; file.hidden = true;
  const demoFill = button('填入示例简历', 'button ghost'); demoFill.id = 'resume-demo-fill';
  const demoHelp = node('p', '合成演示简历，仅填入原文；请自行点击解析、核对和保存。', 'resume-help');
  importer.append(dropzone, file, demoFill, demoHelp);
  const grid = node('div', '', 'resume-grid');
  const sourcePanel = node('details', '', 'card resume-source');
  const sourceSummary = node('summary', '或直接粘贴简历文本'); sourcePanel.append(sourceSummary);
  const rawLabel = node('label', '粘贴完整原文'); rawLabel.htmlFor = 'resume-raw';
  const raw = node('textarea'); raw.id = 'resume-raw'; raw.maxLength = 50000; raw.rows = 10;
  raw.placeholder = '在这里粘贴简历…\n\n建议包含教育背景、技能和项目经历。';
  const count = node('p', '', 'resume-help');
  const parse = button('整理简历内容', 'button primary'); parse.id = 'resume-parse';
  const sourceHelp = node('details', '', 'helper-disclosure'); sourceHelp.append(node('summary', '原文与解析说明'),
    node('p', 'AI 只负责从原文提取信息，不会自动补充不存在的经历。原文仍完整保留，包括未单独展示的奖项等内容。', 'resume-help'));
  const replaceFile = button('改用文件导入', 'button ghost'); replaceFile.id = 'resume-replace-file';
  sourcePanel.append(rawLabel, raw, count, parse, replaceFile, sourceHelp);
  const editPanel = node('section', '', 'card resume-fields');
  const editHeading = node('div', '', 'section-heading'); const stage = node('span', '未开始', 'status-badge'); stage.id = 'resume-stage';
  editHeading.append(node('h2', '核对简历'), stage); editPanel.append(editHeading, node('p', 'AI 仅从原文提取信息，事实仍需你核对。原文与未单独展示的内容会完整保留。', 'resume-help'));
  const basicFields = node('div', '', 'resume-basics'); editPanel.append(basicFields);
  const inputs = {}, badges = {}, proposals = {}, applyButtons = {};
  const labels = {name: '姓名', education: '教育背景', skills: '技能 / 工具', experience: '项目 / 工作经历'};
  let experienceRows = [];
  const skillChips = node('div', '', 'chips resume-skill-chips'); skillChips.setAttribute('aria-label', '当前填写的技能');
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
      if (key !== 'name') input.rows = 2;
      input.placeholder = key === 'name' ? '填写姓名' : key === 'education' ? '学校、专业与学历' : '每行一项技能';
      inputs[key] = input; group.append(input);
      if (key === 'skills') {
        group.insertBefore(skillChips, input);
        group.append(node('p', '每行一项，仅填写你具备的技能。清空也会保留。', 'resume-help'));
      }
    }
    const suggestion = node('details', '', 'resume-suggestion'); suggestion.id = 'resume-suggestion-' + key;
    const summary = node('summary', '发现新的建议');
    const content = node('pre'); applyButtons[key] = button('采用这项建议');
    applyButtons[key].dataset.field = key;
    suggestion.append(summary, content, applyButtons[key]); group.append(suggestion);
    proposals[key] = {details: suggestion, content};
    (key === 'name' || key === 'education' ? basicFields : editPanel).append(group);
  }
  importer.append(sourcePanel); grid.append(importer, editPanel);
  const mode = node('p', '', 'status-badge'); mode.id = 'resume-mode'; mode.hidden = true;
  const status = node('p', '', 'resume-status feedback'); status.id = 'resume-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const recovery = node('div', '', 'resume-actions'); recovery.id = 'resume-ai-recovery';
  const retryAI = button('重新识别', 'button primary'); retryAI.id = 'resume-ai-retry';
  const manual = button('手动填写'); manual.id = 'resume-manual'; recovery.append(retryAI, manual);
  const confirmLabel = node('label', '', 'resume-confirm');
  const confirm = node('input'); confirm.type = 'checkbox'; confirm.id = 'resume-reviewed';
  confirmLabel.append(confirm, node('span', '我已核对以上简历内容，未确认的信息保持空白。'));
  const save = button('确认并保存', 'button primary'); save.id = 'resume-save';
  const nextLink = node('a', '选择目标岗位 →', 'button primary'); nextLink.href = '#jobs'; nextLink.id = 'resume-next'; nextLink.hidden = true;
  const actions = node('div', '', 'resume-actions'); actions.append(save, nextLink);
  const footer = node('section', '', 'card resume-save-panel'); footer.append(confirmLabel, actions);
  editPanel.append(footer);
  container.className = 'resume-editor'; container.replaceChildren(style, heading, description, status, recovery, mode, grid);

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
        const input = node('textarea'); input.rows = 3; input.id = label.htmlFor; input.maxLength = 50000;
        input.placeholder = '描述背景、你的行动与实际结果…';
        const remove = button('删除这段', 'button danger'); remove.setAttribute('aria-label', `删除经历 ${index + 1}`);
        input.addEventListener('input', () => {
          const values = [...currentState.values.experience]; values[index] = input.value; controller.edit('experience', values);
        });
        remove.addEventListener('click', () => controller.edit('experience', currentState.values.experience.filter((_, i) => i !== index)));
        const rowHeading = node('div', '', 'resume-label-row'); rowHeading.append(label, remove);
        row.append(rowHeading, input); return {row, input, remove};
      });
      experiences.replaceChildren(...experienceRows.map(x => x.row));
    }
    experienceRows.forEach(({input, remove}, index) => {
      if (input.value !== state.values.experience[index]) input.value = state.values.experience[index];
      input.readOnly = locked; remove.disabled = locked;
    });
    if (!experienceRows.length) experiences.replaceChildren(node('p', '还没有经历。整理原文，或手动添加一段。', 'compact-empty'));
    renderChips(skillChips, state.values.skills.split(/\r?\n/).map(x => x.trim()).filter(Boolean));
    skillChips.hidden = !state.values.skills.trim();
    for (const key of Object.keys(labels)) {
      const protectedField = state.protectedFields.includes(key);
      const field = fieldStatus(state.values[key], protectedField, state.reviewed);
      badges[key].textContent = field.text; badges[key].dataset.state = field.tone;
      badges[key].dataset.protected = String(protectedField);
      const differs = state.candidate && JSON.stringify(state.candidate[key]) !== JSON.stringify(state.values[key]);
      proposals[key].details.hidden = !differs;
      if (differs) proposals[key].content.textContent = (Array.isArray(state.candidate[key])
        ? state.candidate[key].join('\n\n') : state.candidate[key]) || '（解析结果为空）';
      applyButtons[key].disabled = Boolean(state.busy);
    }
    /* Direct history selection */
    const historyButtons = state.rows.map(row => {
      const item = button('', 'resume-history-item'); item.dataset.resumeId = row.id;
      item.append(node('strong', row.name || '未命名简历'));
      const date = row.created_at ? new Date(row.created_at) : null;
      item.append(node('span', `${date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('zh-CN') + ' · ' : ''}${row.id === state.savedId ? '当前简历' : '已保存'}`));
      const preview = [row.education, row.skills.join('、'), row.experience[0]].filter(Boolean).join(' · ');
      if (preview) item.append(node('small', preview.length > 90 ? preview.slice(0, 90) + '…' : preview));
      item.disabled = Boolean(state.busy);
      item.addEventListener('click', async () => {
        const result = await controller.load(row.id);
        if (result?.requiresConfirmation && window.confirm('打开这份简历会替换当前未保存修改，是否继续？')) await controller.load(row.id, true);
        if (!currentState.error && currentState.savedId === row.id) history.open = false;
      }); return item;
    });
    historyList.replaceChildren(...(historyButtons.length ? historyButtons : [node('p', '保存后的简历会出现在这里。', 'resume-help')]));
    historyRetry.hidden = !state.historyError; historyRetry.disabled = Boolean(state.busy);
    const imported = Boolean(state.imported || state.savedId || state.candidate);
    grid.classList.toggle('is-reviewing', imported);
    editPanel.hidden = !imported;
    dropzone.hidden = imported || state.aiStatus === 'failed';
    sourceSummary.textContent = imported ? '简历原文与重新整理' : '或直接粘贴简历文本';
    if (imported && !grid.dataset.reviewing) sourcePanel.open = true;
    grid.dataset.reviewing = imported ? 'yes' : '';
    if (!imported && state.values.raw_text) sourcePanel.open = true;
    recovery.hidden = state.aiStatus !== 'failed';
    retryAI.disabled = manual.disabled = Boolean(state.busy);
    parse.hidden = state.aiStatus === 'failed';
    for (const element of [newButton, dropzone, file, replaceFile, parse, confirm, demoFill]) element.disabled = Boolean(state.busy);
    addExperience.disabled = locked || state.values.experience.length >= 500;
    previous.disabled = Boolean(state.busy) || state.offset === 0;
    next.disabled = Boolean(state.busy) || state.rows.length < 20;
    previous.hidden = next.hidden = state.rows.length < 20 && state.offset === 0;
    confirm.checked = state.reviewed;
    save.disabled = Boolean(state.busy) || !state.reviewed || !state.values.raw_text.trim();
    save.textContent = state.busy === 'save' ? '保存并核对中…' : state.pendingSave ? '重试确认保存' : '确认并保存';
    parse.textContent = state.busy === 'parse' ? 'AI 识别中…' : imported ? '重新识别原文' : '用 AI 识别简历';
    const saved = Boolean(state.savedId && state.reviewed && !state.dirty && !state.pendingSave);
    stage.textContent = ['parse', 'upload'].includes(state.busy) ? 'AI 识别中' : state.aiStatus === 'failed' ? 'AI 识别失败' : state.aiStatus === 'manual' ? '手动填写' : state.aiStatus === 'mock' ? '演示结果' : saved ? '已保存' : state.reviewed ? '已确认' : state.parseMock !== null ? '待核对' : state.dirty ? '已修改' : '未开始';
    stage.dataset.state = state.busy ? 'busy' : saved || state.reviewed ? 'success' : 'neutral';
    status.textContent = userText((state.aiStatus === 'failed' ? 'AI 暂时无法识别这份简历。原文已保留，可以重试或手动填写。' + (state.error ? ' ' + state.error : '') : state.error) || (['parse', 'upload'].includes(state.busy) ? '正在用 AI 识别简历内容……' : state.busy === 'save' ? '正在保存简历……' : state.notice || (state.busy ? '正在读取简历……' : saved ? '简历已保存，接下来选择目标岗位。' : imported ? '请核对内容，未识别的信息可以补充或留空。' : '')));
    status.hidden = !status.textContent;
    setFeedback(status, {busy: Boolean(state.busy), error: state.error, success: saved});
    save.hidden = saved; confirmLabel.hidden = saved;
    save.className = 'button ' + (state.reviewed && !saved ? 'primary' : 'secondary');
    parse.className = 'button ' + (!imported ? 'primary' : 'secondary');
    mode.hidden = state.parseMock !== true;
    mode.textContent = '演示模式'; mode.title = '请自行核对事实，不把示例内容当作真实经历。';
    nextLink.hidden = !saved || Boolean(state.busy) || state.aiStatus === 'failed';
  }, retainedDraft);
  demoFill.addEventListener('click', () => {
    if (currentState.busy) return;
    if (raw.value.trim() && raw.value !== demoResume && !window.confirm('填入示例简历会替换当前原文，是否继续？')) return;
    controller.edit('raw_text', demoResume); sourcePanel.open = true; raw.focus(); raw.setSelectionRange(0, 0); raw.scrollTop = 0;
  });
  raw.addEventListener('input', () => controller.edit('raw_text', raw.value));
  for (const key of Object.keys(inputs)) inputs[key].addEventListener('input', () => controller.edit(key, inputs[key].value));
  for (const key of Object.keys(labels)) applyButtons[key].addEventListener('click', () => controller.apply(key));
  retryAI.addEventListener('click', controller.parse); manual.addEventListener('click', controller.manual);
  parse.addEventListener('click', controller.parse); save.addEventListener('click', controller.save);
  confirm.addEventListener('change', () => controller.review(confirm.checked));
  addExperience.addEventListener('click', () => controller.edit('experience', [...currentState.values.experience, '']));
  replaceFile.addEventListener('click', () => file.click());
  historyRetry.addEventListener('click', () => controller.refresh(currentState.offset));
  dropzone.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => { if (file.files?.[0]) await controller.upload(file.files[0]); file.value = ''; });
  dropzone.addEventListener('dragover', event => { event.preventDefault(); if (!currentState.busy) dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('drag-over'); if (!currentState.busy) controller.upload(event.dataTransfer.files?.[0]); });
  previous.addEventListener('click', () => controller.refresh(Math.max(0, currentState.offset - 20)));
  next.addEventListener('click', () => controller.refresh(currentState.offset + 20));
  newButton.addEventListener('click', () => {
    const result = controller.reset();
    if (result?.requiresConfirmation && window.confirm('导入另一份简历会清空当前未保存修改，是否继续？')) controller.reset(true);
    if (!currentState.dirty) { history.open = false; sourcePanel.open = false; }
  });
  const beforeUnload = event => { if (currentState?.dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  controller.init();
  return () => { retainedDraft = controller.getDraft(); controller.dispose(); window.removeEventListener('beforeunload', beforeUnload); style.remove(); };
}
