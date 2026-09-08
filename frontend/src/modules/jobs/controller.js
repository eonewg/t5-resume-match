export function connectJobs({api, getState, updateSelection, subscribe, signal}, render) {
  let state = {jobs: [], resumes: [], jdId: getState().jdId || '', resumeId: getState().resumeId || '',
    result: getState().result?.match || null, busy: false, error: '', notice: '', jobMock: null};
  let disposed = false, version = 0;
  const active = () => !disposed && !signal.aborted;
  const show = () => { if (active()) render({...state}); };
  const unsubscribe = subscribe(next => {
    if ((next.jdId || '') !== state.jdId || (next.resumeId || '') !== state.resumeId) {
      version++; state = {...state, jdId: next.jdId || '', resumeId: next.resumeId || '', result: null, busy: false};
      show();
    }
  });
  function choose(key, value) {
    version++; state = {...state, [key]: value, result: null, error: '', busy: false};
    updateSelection({jdId: state.jdId || null, resumeId: state.resumeId || null, result: null, isMock: true});
    show();
  }
  async function task(work) {
    if (!active() || state.busy) return;
    const ticket = ++version;
    state.busy = true; state.error = ''; state.notice = ''; state.result = null; show();
    try {
      const update = await work();
      if (!active() || ticket !== version) return;
      state = {...state, ...update};
      if (update.result) {
        const shared = getState();
        updateSelection({resumeId: state.resumeId, jdId: state.jdId, result: {...shared.result, match: update.result}, isMock: update.result.is_mock});
      }
      const shared = getState();
      if ((shared.jdId || '') !== state.jdId || (shared.resumeId || '') !== state.resumeId) {
        updateSelection({jdId: state.jdId || null, resumeId: state.resumeId || null, result: null, isMock: true});
      }
    } catch (error) {
      if (active() && ticket === version) state.error = error.message || '请求失败，请重试。';
    } finally { if (ticket === version) {state.busy = false; show();} }
  }
  const load = () => task(async () => {
    const [jobs, resumes, modes] = await Promise.all([
      api.request('/api/v1/jobs?limit=100'), api.request('/api/v1/resumes?limit=100'), api.request('/api/v1/modules')]);
    const jobRows = [...jobs.data], resumeRows = [...resumes.data];
    if (state.jdId && !jobRows.some(x => x.id === state.jdId)) jobRows.push((await api.request('/api/v1/jobs/' + encodeURIComponent(state.jdId))).data);
    if (state.resumeId && !resumeRows.some(x => x.id === state.resumeId)) resumeRows.push((await api.request('/api/v1/resumes/' + encodeURIComponent(state.resumeId))).data);
    const cached = getState().result?.match;
    return {jobs: jobRows, resumes: resumeRows, jobMock: modes.data.jobs?.is_mock,
      result: cached?.resume_id === state.resumeId && cached?.jd_id === state.jdId ? cached : null,
      notice: '已加载前 100 条已保存记录及工作台当前选择。'};
  });
  const create = form => task(async () => {
    if (!form.title.trim() || !form.jd_text.trim()) throw Error('请填写岗位名称和 JD 原文。');
    const {data, isMock} = await api.request('/api/v1/jobs', {method: 'POST', body: form});
    return {jobs: [...state.jobs.filter(x => x.id !== data.id), data], jdId: data.id,
      notice: isMock ? 'JD 已保存（Mock 解析）。' : 'JD 已解析并保存。'};
  });
  const match = () => task(async () => {
    if (!state.resumeId || !state.jdId) throw Error('请选择已保存的简历与 JD。');
    const selected = {resume_id: state.resumeId, jd_id: state.jdId};
    updateSelection({resumeId: state.resumeId, jdId: state.jdId, result: null});
    const response = await api.request('/api/v1/matches', {method: 'POST', body: selected});
    const result = response.data;
    if (result.resume_id !== selected.resume_id || result.jd_id !== selected.jd_id ||
        !Number.isFinite(result.score) || result.score < 0 || result.score > 100 ||
        !['matched_skills','missing_skills','gap_analysis'].every(k => Array.isArray(result[k]) && result[k].every(x => typeof x === 'string')) ||
        typeof result.is_mock !== 'boolean') throw Error('匹配结果不符合公共契约。');
    return {result: {...result, is_mock: result.is_mock || response.isMock === true}};
  });
  function dispose() { if (disposed) return; disposed = true; version++; unsubscribe(); signal.removeEventListener('abort', dispose); }
  signal.addEventListener('abort', dispose, {once: true}); show();
  if (signal.aborted) dispose();
  return {load, create, match, choose, dispose};
}
