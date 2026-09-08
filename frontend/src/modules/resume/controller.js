const fields = ['name', 'education', 'skills', 'experience'];
const blankValues = () => ({raw_text: '', name: '', education: '', skills: '', experience: []});
const editable = data => ({raw_text: data.raw_text, name: data.name ?? '', education: data.education,
  skills: data.skills.join('\n'), experience: [...data.experience]});

export function resumePayload(values) {
  return {raw_text: values.raw_text, name: values.name.trim() ? values.name : null,
    education: values.education,
    skills: values.skills.split(/\r?\n/).map(x => x.trim()).filter(Boolean),
    experience: values.experience.map(x => x.trim()).filter(Boolean)};
}

function checked(data, idRequired = false) {
  if (!data || typeof data.raw_text !== 'string' || typeof data.education !== 'string' ||
      !(data.name === null || typeof data.name === 'string') ||
      !['skills', 'experience'].every(key => Array.isArray(data[key]) && data[key].every(x => typeof x === 'string')) ||
      (idRequired && (typeof data.id !== 'string' || !data.id))) throw Error('简历响应不符合公共契约。');
  return data;
}

function fingerprint(data) {
  return JSON.stringify({raw_text: data.raw_text, name: data.name, education: data.education,
    skills: data.skills, experience: data.experience});
}

export function connectResume(context, render, retained = null) {
  const {api, signal, getState, updateSelection} = context;
  let state = {values: blankValues(), protectedFields: [], reviewed: false, candidate: null,
    parseMock: null, savedId: null, savedSnapshot: null, pendingSave: null, ...structuredClone(retained || {}),
    rows: [], offset: 0, busy: '', error: '', notice: '', dirty: false};
  let disposed = false, ticket = 0, rawRevision = 0;
  const active = () => !disposed && !signal.aborted;
  const refreshDirty = () => {
    const value = resumePayload(state.values);
    state.dirty = state.savedSnapshot ? fingerprint(value) !== state.savedSnapshot
      : Boolean(value.raw_text || value.name || value.education || value.skills.length || value.experience.length);
  };
  const show = () => { refreshDirty(); if (active()) render(structuredClone(state)); };
  const invalidateSelection = () => {
    if (state.savedId && getState().resumeId === state.savedId) updateSelection({resumeId: null, result: null});
  };
  function edit(field, value) {
    if (!active() || !['', 'parse'].includes(state.busy)) return;
    if (!fields.includes(field) && field !== 'raw_text') throw Error('Unknown resume field');
    state.values[field] = structuredClone(value);
    state.reviewed = false;
    if (field === 'raw_text') { rawRevision++; state.candidate = null; }
    else if (!state.protectedFields.includes(field)) state.protectedFields.push(field);
    state.error = ''; state.notice = '有未确认的修改；保存后才会用于岗位匹配。';
    invalidateSelection(); show();
  }
  function review(value) {
    if (!active() || state.busy) return;
    state.reviewed = value;
    if (value) state.protectedFields = [...fields];
    show();
  }
  async function task(kind, work) {
    if (!active() || state.busy) return;
    const current = ++ticket;
    state.busy = kind; state.error = ''; state.notice = ''; show();
    const valid = () => active() && current === ticket;
    try { await work(valid); }
    catch (error) { if (valid()) state.error = error.message || '请求失败，填写的内容已保留。'; }
    finally { if (valid()) { state.busy = ''; show(); } }
  }
  const parse = () => task('parse', async valid => {
    const raw = state.values.raw_text, revision = rawRevision;
    if (!raw.trim()) throw Error('请先粘贴简历原文。');
    const response = await api.request('/api/v1/resumes/preview', {method: 'POST', body: {raw_text: raw}});
    if (!valid()) return;
    if (revision !== rawRevision) { state.notice = '原文已变化，旧解析结果未应用。请重新解析。'; return; }
    const data = checked(response.data);
    if (data.raw_text !== raw) throw Error('解析响应未保留原文，建议未应用。');
    state.candidate = editable(data); state.parseMock = response.isMock === true;
    let changed = false;
    for (const field of fields) {
      if (!state.protectedFields.includes(field)) {
        changed ||= JSON.stringify(state.values[field]) !== JSON.stringify(state.candidate[field]);
        state.values[field] = structuredClone(state.candidate[field]);
      }
    }
    if (changed) { state.reviewed = false; invalidateSelection(); }
    state.notice = state.protectedFields.length
      ? '解析完成。已编辑或确认字段保持不变；可以逐项查看并采用新建议。'
      : '解析完成。请核对结构化内容；未识别信息可留空或手动补充。';
  });
  function apply(field) {
    if (!active() || state.busy || !fields.includes(field) || !state.candidate) return;
    // Only an explicit per-field action may replace a protected value.
    edit(field, state.candidate[field]);
    state.notice = '已采用此项解析建议，请重新核对后保存。'; show();
  }
  const refresh = (offset = 0) => task('refresh', async valid => {
    const response = await api.request(`/api/v1/resumes?order=desc&limit=20&offset=${offset}`);
    if (!valid()) return;
    if (!Array.isArray(response.data)) throw Error('保存记录列表无法读取。');
    state.rows = response.data.map(row => checked(row, true)); state.offset = offset;
  });
  function acceptSaved(data, isMock) {
    state.values = editable(data); state.savedId = data.id; state.savedSnapshot = fingerprint(data);
    state.protectedFields = [...fields]; state.reviewed = true; state.candidate = null;
    state.parseMock = isMock; state.pendingSave = null;
    state.rows = [data, ...state.rows.filter(row => row.id !== data.id)].slice(0, 20);
    updateSelection({resumeId: data.id, result: null});
  }
  async function load(identifier, discard = false) {
    refreshDirty();
    if (!active() || state.busy || !identifier) return;
    if (state.dirty && !discard) return {requiresConfirmation: true};
    return task('load', async valid => {
      const response = await api.request('/api/v1/resumes/' + encodeURIComponent(identifier));
      if (!valid()) return;
      const data = checked(response.data, true);
      if (data.id !== identifier) throw Error('服务返回了另一份简历，当前内容已保留。');
      acceptSaved(data, response.isMock === true);
      state.notice = '已重新加载保存版本。全部字段已保护，重解析不会自动覆盖。';
    });
  }
  const save = () => task('save', async valid => {
    const payload = resumePayload(state.values);
    if (!payload.raw_text.trim()) throw Error('请填写简历原文。');
    if (!state.reviewed) throw Error('请先核对并确认结构化内容。');
    if (payload.skills.length > 500 || payload.experience.length > 500 || payload.skills.some(x => x.length > 200)) {
      throw Error('技能与经历各最多 500 项，每项技能最多 200 字。');
    }
    const snapshot = fingerprint(payload);
    if (state.savedSnapshot === snapshot && state.savedId && !state.pendingSave) {
      updateSelection({resumeId: state.savedId, result: null});
      state.notice = '内容与保存版本一致，已选择用于岗位匹配。'; return;
    }
    let identifier = state.pendingSave?.snapshot === snapshot ? state.pendingSave.id : null;
    if (!identifier) {
      const saved = await api.request('/api/v1/resumes', {method: 'POST', body: payload});
      if (!valid()) return;
      const data = checked(saved.data, true);
      state.pendingSave = {id: data.id, snapshot};
      state.savedId = data.id;
      identifier = data.id;
    }
    let response;
    try { response = await api.request('/api/v1/resumes/' + encodeURIComponent(identifier)); }
    catch { throw Error('保存已成功，但重新读取未完成。内容已保留；再次点击保存将只重试读取。'); }
    if (!valid()) return;
    const reread = checked(response.data, true);
    if (reread.id !== identifier || fingerprint(reread) !== snapshot) {
      throw Error('重新读取内容与确认值不一致，尚未选择用于匹配。请重试读取或检查服务。');
    }
    acceptSaved(reread, response.isMock === true);
    state.notice = '已保存并重新读取，全部字段一致。可继续前往岗位匹配。';
  });
  function reset(discard = false) {
    refreshDirty();
    if (!active() || state.busy) return;
    if (state.dirty && !discard) return {requiresConfirmation: true};
    invalidateSelection(); rawRevision++;
    state = {...state, values: blankValues(), protectedFields: [], reviewed: false, candidate: null,
      parseMock: null, savedId: null, savedSnapshot: null, pendingSave: null, error: '', notice: '已开始一份新简历。'};
    show();
  }
  function getDraft() {
    const keys = ['values', 'protectedFields', 'reviewed', 'candidate', 'parseMock', 'savedId', 'savedSnapshot', 'pendingSave'];
    return structuredClone(Object.fromEntries(keys.map(key => [key, state[key]])));
  }
  function dispose() { disposed = true; ticket++; signal.removeEventListener('abort', dispose); }
  signal.addEventListener('abort', dispose, {once: true}); show();
  return {edit, review, parse, apply, refresh, load, save, reset, getDraft, dispose,
    async init() {
      await refresh();
      const identifier = getState().resumeId;
      if (active() && identifier && !state.dirty && identifier !== state.savedId) await load(identifier);
    }};
}
