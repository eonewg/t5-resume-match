import type { ControllerContext, JobsState } from '../../core/controller-types';
import type { JD, JDCreate, MatchRecord, Modules, Resume } from '../../core/contracts';
import { failureMessage } from '../../core/errors';

export function connectJobs(
  { api, getState, updateSelection, subscribe, signal, view }: ControllerContext,
  render: (state: JobsState) => void,
) {
  let state: JobsState = {
    assessmentBusy: false,
    assessmentError: '',
    jobs: [],
    resumes: [],
    jdId: getState().jdId || '',
    resumeId: getState().resumeId || '',
    result: getState().result?.match || null,
    busy: false,
    error: '',
    notice: '',
    jobMock: null,
  };
  let disposed = false,
    version = 0;
  const active = () => !disposed && !signal.aborted;
  const show = () => {
    if (active()) render({ ...state });
  };
  const unsubscribe = subscribe((next) => {
    if ((next.jdId || '') !== state.jdId || (next.resumeId || '') !== state.resumeId) {
      version++;
      state = {
        ...state,
        jdId: next.jdId || '',
        resumeId: next.resumeId || '',
        result: next.result?.match || null,
        busy: false,
        assessmentBusy: false,
        assessmentError: '',
      };
      show();
    }
  });
  function choose(key: 'jdId' | 'resumeId', value: string) {
    version++;
    state = {
      ...state,
      [key]: value,
      result: null,
      error: '',
      busy: false,
      assessmentBusy: false,
      assessmentError: '',
    };
    updateSelection({
      jdId: state.jdId || null,
      resumeId: state.resumeId || null,
      isMock: true,
    });
    state.result = getState().result?.match || null;
    show();
  }
  async function task(work: () => Promise<Partial<JobsState>>) {
    if (!active() || state.busy || state.assessmentBusy) return;
    const ticket = ++version;
    state.busy = true;
    state.error = '';
    state.assessmentError = '';
    state.notice = '';
    state.result = null;
    show();
    try {
      const update = await work();
      if (!active() || ticket !== version) return;
      state = { ...state, ...update };
      if (update.result) {
        const shared = getState();
        updateSelection({
          resumeId: state.resumeId,
          jdId: state.jdId,
          result: { ...shared.result, match: update.result },
          isMock: update.result.is_mock,
        });
      }
      const shared = getState();
      if ((shared.jdId || '') !== state.jdId || (shared.resumeId || '') !== state.resumeId) {
        updateSelection({
          jdId: state.jdId || null,
          resumeId: state.resumeId || null,
          result: null,
          isMock: true,
        });
      }
    } catch (error) {
      if (active() && ticket === version) state.error = failureMessage(error);
    } finally {
      if (ticket === version) {
        state.busy = false;
        show();
      }
    }
  }
  const load = () =>
    task(async () => {
      if (view === 'matching') {
        const cached = getState().result?.match;
        if (!state.resumeId || !state.jdId) return { notice: '' };
        const [job, resume] = await Promise.all([
          api.request<JD>('/api/v1/jobs/' + encodeURIComponent(state.jdId)),
          api.request<Resume>('/api/v1/resumes/' + encodeURIComponent(state.resumeId)),
        ]);
        return {
          jobs: [job.data],
          resumes: [resume.data],
          result:
            cached?.resume_id === state.resumeId && cached?.jd_id === state.jdId ? cached : null,
          notice: '',
        };
      }
      const [jobs, resumes, modes] = await Promise.all([
        api.request<JD[]>('/api/v1/jobs?limit=100'),
        api.request<Resume[]>('/api/v1/resumes?limit=100'),
        api.request<Modules>('/api/v1/modules'),
      ]);
      const jobRows = [...jobs.data],
        resumeRows = [...resumes.data];
      for (let offset = 100, count = jobs.data.length; count === 100; offset += 100) {
        const batch = (await api.request<JD[]>(`/api/v1/jobs?limit=100&offset=${offset}`)).data;
        jobRows.push(...batch);
        count = batch.length;
      }
      if (state.jdId && !jobRows.some((x) => x.id === state.jdId))
        jobRows.push(
          (await api.request<JD>('/api/v1/jobs/' + encodeURIComponent(state.jdId))).data,
        );
      if (state.resumeId && !resumeRows.some((x) => x.id === state.resumeId))
        resumeRows.push(
          (await api.request<Resume>('/api/v1/resumes/' + encodeURIComponent(state.resumeId))).data,
        );
      const cached = getState().result?.match;
      return {
        jobs: jobRows,
        resumes: resumeRows,
        jobMock: modes.data.jobs?.is_mock,
        result:
          cached?.resume_id === state.resumeId && cached?.jd_id === state.jdId ? cached : null,
        notice: '',
      };
    });
  const create = (form: JDCreate) =>
    task(async () => {
      if (
        !form.title.trim() ||
        !(form.jd_text.trim() || form.responsibilities?.trim() || form.requirements?.trim())
      )
        throw Error('请填写岗位名称，并补充职责、任职要求或岗位原文。');
      const { data, isMock } = await api.request<JD>('/api/v1/jobs', {
        method: 'POST',
        body: form,
      });
      return {
        jobs: [...state.jobs.filter((x) => x.id !== data.id), data],
        jdId: data.id,
        notice: isMock ? '岗位已保存并选中（演示解析）。' : '岗位已保存并选中。',
      };
    });
  const match = () =>
    task(async () => {
      if (!state.resumeId || !state.jdId) throw Error('请选择已保存的简历与 JD。');
      const selected = { resume_id: state.resumeId, jd_id: state.jdId };
      updateSelection({ resumeId: state.resumeId, jdId: state.jdId, result: null });
      const response = await api.request<MatchRecord>('/api/v1/matches', {
        method: 'POST',
        body: selected,
      });
      const result = response.data;
      if (
        result.resume_id !== selected.resume_id ||
        result.jd_id !== selected.jd_id ||
        !Number.isFinite(result.score) ||
        result.score < 0 ||
        result.score > 100 ||
        !(['matched_skills', 'missing_skills', 'gap_analysis'] as const).every(
          (k) => Array.isArray(result[k]) && result[k].every((x) => typeof x === 'string'),
        ) ||
        typeof result.is_mock !== 'boolean'
      )
        throw Error('匹配结果不符合公共契约。');
      return { result: { ...result, is_mock: result.is_mock || response.isMock === true } };
    });
  async function assess() {
    const previous = state.result;
    if (
      !active() ||
      state.busy ||
      state.assessmentBusy ||
      !previous ||
      previous.is_mock ||
      previous.ai_assessment
    )
      return;
    const ticket = ++version;
    state.assessmentBusy = true;
    state.assessmentError = '';
    show();
    try {
      const response = await api.request<MatchRecord>(
        '/api/v1/matches/' + encodeURIComponent(previous.id) + '/assessment',
        { method: 'POST' },
      );
      if (!active() || ticket !== version) return;
      const result = response.data,
        ai = result.ai_assessment;
      if (
        result.id !== previous.id ||
        result.resume_id !== state.resumeId ||
        result.jd_id !== state.jdId ||
        response.isMock ||
        result.is_mock !== false ||
        !ai ||
        !Number.isFinite(ai.score) ||
        ai.score < 0 ||
        ai.score > 100 ||
        typeof ai.summary !== 'string' ||
        typeof ai.model !== 'string' ||
        !Array.isArray(ai.dimensions) ||
        ai.dimensions.length !== 3 ||
        new Set(ai.dimensions.map((d) => d.dimension)).size !== 3 ||
        !ai.dimensions.every(
          (d) =>
            ['skills', 'experience', 'education'].includes(d.dimension) &&
            typeof d.applicable === 'boolean' &&
            Number.isFinite(d.score) &&
            d.score >= 0 &&
            d.score <= 100 &&
            typeof d.reason === 'string' &&
            [d.jd_quotes, d.resume_quotes].every(
              (q) => Array.isArray(q) && q.every((x) => typeof x === 'string'),
            ),
        )
      )
        throw Error('AI 评估结果不符合公共契约，关键词结果已保留。');
      // Only add the assessment; never replace the independent keyword result.
      state.result = { ...previous, ai_assessment: ai };
      updateSelection({
        resumeId: state.resumeId,
        jdId: state.jdId,
        result: { ...getState().result, match: state.result },
        isMock: false,
      });
    } catch (error) {
      if (active() && ticket === version) state.assessmentError = failureMessage(error);
    } finally {
      if (active() && ticket === version) {
        state.assessmentBusy = false;
        show();
      }
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    version++;
    unsubscribe();
    signal.removeEventListener('abort', dispose);
  }
  signal.addEventListener('abort', dispose, { once: true });
  show();
  if (signal.aborted) dispose();
  async function upload(file: File): Promise<JDCreate | undefined> {
    let draft: JDCreate | undefined;
    await task(async () => {
      const ticket = version;
      if (!/\.(png|jpe?g|webp)$/i.test(file.name)) throw Error('请选择 PNG、JPEG 或 WEBP 截图。');
      if (!file.size || file.size > 10 * 1024 * 1024) throw Error('图片须为非空文件，最大 10 MB。');
      const body = new FormData();
      body.append('file', file);
      const response = await api.request<JDCreate>('/api/v1/jobs/upload-preview', {
        method: 'POST',
        body,
      });
      if (active() && ticket === version) draft = response.data;
      return { notice: '截图已识别，请核对各字段后保存；未展示或看不清的内容请自行补充。' };
    });
    return active() ? draft : undefined;
  }
  return { load, create, upload, match, assess, choose, dispose };
}
export type JobsController = ReturnType<typeof connectJobs>;
