import type { ApiResponse } from '../../core/api';
import { failureMessage } from '../../core/errors';
import type { Resume, ResumeData } from '../../core/contracts';
import type {
  ControllerContext,
  ResumeDraft,
  ResumeField,
  ResumeState,
  ResumeValues,
} from '../../core/controller-types';

const fields: ResumeField[] = ['name', 'education', 'skills', 'experience'];
const blankValues = (): ResumeValues => ({
  raw_text: '',
  name: '',
  education: '',
  skills: '',
  experience: [],
});
const editable = (data: ResumeData): ResumeValues => ({
  raw_text: data.raw_text,
  name: data.name ?? '',
  education: data.education,
  skills: data.skills.join('\n'),
  experience: [...data.experience],
});

export function resumePayload(values: ResumeValues): ResumeData {
  return {
    raw_text: values.raw_text,
    name: values.name.trim() ? values.name : null,
    education: values.education,
    skills: values.skills
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean),
    experience: values.experience.map((x) => x.trim()).filter(Boolean),
  };
}

function checked<T extends ResumeData>(data: T, idRequired = false): T {
  if (
    !data ||
    typeof data.raw_text !== 'string' ||
    typeof data.education !== 'string' ||
    !(data.name === null || typeof data.name === 'string') ||
    !(['skills', 'experience'] as const).every(
      (key) => Array.isArray(data[key]) && data[key].every((x) => typeof x === 'string'),
    ) ||
    (idRequired && (!('id' in data) || typeof data.id !== 'string' || !data.id))
  )
    throw Error('简历响应不符合公共契约。');
  return data;
}

function fingerprint(data: ResumeData) {
  return JSON.stringify({
    raw_text: data.raw_text,
    name: data.name,
    education: data.education,
    skills: data.skills,
    experience: data.experience,
  });
}

export function connectResume(
  context: ControllerContext,
  render: (state: ResumeState) => void,
  retained: ResumeDraft | null = null,
) {
  const { api, signal, getState, updateSelection } = context;
  let state: ResumeState = {
    values: blankValues(),
    protectedFields: [],
    reviewed: false,
    candidate: null,
    aiStatus: 'idle',
    imported: false,
    parseMock: null,
    savedId: null,
    savedSnapshot: null,
    pendingSave: null,
    ...structuredClone(retained || {}),
    rows: [],
    offset: 0,
    busy: '',
    error: '',
    notice: '',
    dirty: false,
    historyError: false,
  };
  let disposed = false,
    ticket = 0,
    rawRevision = 0;
  const active = () => !disposed && !signal.aborted;
  const refreshDirty = () => {
    const value = resumePayload(state.values);
    state.dirty = state.savedSnapshot
      ? fingerprint(value) !== state.savedSnapshot
      : Boolean(
          value.raw_text ||
          value.name ||
          value.education ||
          value.skills.length ||
          value.experience.length,
        );
  };
  const show = () => {
    refreshDirty();
    if (active()) render(structuredClone(state));
  };
  const invalidateSelection = () => {
    if (state.savedId && getState().resumeId === state.savedId)
      updateSelection({ resumeId: null, result: null });
  };
  function edit<K extends keyof ResumeValues>(field: K, value: ResumeValues[K]) {
    if (!active() || !['', 'parse'].includes(state.busy)) return;
    if (field !== 'raw_text' && !fields.includes(field as ResumeField))
      throw Error('Unknown resume field');
    state.values[field] = structuredClone(value);
    state.reviewed = false;
    if (field === 'raw_text') {
      rawRevision++;
      state.candidate = null;
      state.aiStatus = 'idle';
    } else if (!state.protectedFields.includes(field as ResumeField))
      state.protectedFields.push(field as ResumeField);
    state.error = '';
    state.notice = '有未确认的修改；保存后才会用于岗位匹配。';
    invalidateSelection();
    show();
  }
  function review(value: boolean) {
    if (!active() || state.busy) return;
    state.reviewed = value;
    if (value) state.protectedFields = [...fields];
    show();
  }
  async function task(kind: string, work: (valid: () => boolean) => Promise<void>) {
    if (!active() || state.busy) return;
    const current = ++ticket;
    state.busy = kind;
    state.error = '';
    state.notice = '';
    if (kind === 'refresh') state.historyError = false;
    if (['parse', 'upload'].includes(kind)) {
      state.candidate = null;
      state.aiStatus = 'idle';
    }
    show();
    const valid = () => active() && current === ticket;
    try {
      await work(valid);
    } catch (error) {
      if (valid()) {
        state.error = failureMessage(error, '请求失败，填写的内容已保留。');
        if (kind === 'refresh') state.historyError = true;
      }
    } finally {
      if (valid()) {
        state.busy = '';
        show();
      }
    }
  }
  const parse = () =>
    task('parse', async (valid) => {
      const raw = state.values.raw_text,
        revision = rawRevision;
      if (!raw.trim()) throw Error('请先粘贴简历原文。');
      let response: ApiResponse<ResumeData>;
      try {
        response = await api.request<ResumeData>('/api/v1/resumes/preview', {
          method: 'POST',
          body: { raw_text: raw },
        });
      } catch (error) {
        if (!valid() || revision !== rawRevision) return;
        state.aiStatus = 'failed';
        state.parseMock = null;
        throw error;
      }
      if (!valid()) return;
      if (revision !== rawRevision) {
        state.notice = '原文已变化，旧解析结果未应用。请重新解析。';
        return;
      }
      let data;
      try {
        data = checked(response.data);
        if (data.raw_text !== raw) throw Error('识别响应未保留原文，结果未应用。');
      } catch (error) {
        state.aiStatus = 'failed';
        state.parseMock = null;
        throw error;
      }
      acceptPreview(data, response.isMock);
    });
  function acceptPreview(data: ResumeData, isMock: boolean) {
    state.imported = true;
    state.aiStatus = isMock === true ? 'mock' : 'success';
    state.candidate = editable(data);
    state.parseMock = isMock === true;
    let changed = false;
    for (const field of fields) {
      if (!state.protectedFields.includes(field)) {
        changed ||= JSON.stringify(state.values[field]) !== JSON.stringify(state.candidate[field]);
        if (field === 'experience')
          state.values.experience = structuredClone(state.candidate.experience);
        else state.values[field] = state.candidate[field];
      }
    }
    if (changed) {
      state.reviewed = false;
      invalidateSelection();
    }
    state.notice =
      (isMock === true
        ? '演示识别结果，请核对事实；这不是实时 AI 识别。'
        : 'AI 已完成结构化识别，请核对后保存。') +
      (state.protectedFields.length ? '已编辑或确认字段保持不变，可逐项采用新的识别结果。' : '');
  }
  const upload = (file?: File) =>
    task('upload', async (valid) => {
      if (!file) throw Error('请选择一份简历文件。');
      if (!/\.(pdf|docx|txt)$/i.test(file.name)) throw Error('请上传 PDF、DOCX 或 TXT 简历。');
      if (!file.size) throw Error('文件为空，请选择包含简历内容的文件。');
      if (file.size > 10 * 1024 * 1024) throw Error('文件超过 10 MB，请选择更小的文件。');
      const body = new FormData();
      body.append('file', file);
      let response: ApiResponse<ResumeData>;
      try {
        response = await api.request<ResumeData>('/api/v1/resumes/upload-preview', {
          method: 'POST',
          body,
        });
      } catch (error) {
        if (!valid()) return;
        if (
          error &&
          typeof error === 'object' &&
          'rawText' in error &&
          typeof error.rawText === 'string' &&
          error.rawText.trim()
        ) {
          state.values.raw_text = error.rawText;
          rawRevision++;
          state.reviewed = false;
          state.parseMock = null;
          state.aiStatus = 'failed';
          invalidateSelection();
        }
        throw error;
      }
      if (!valid()) return;
      const data = checked(response.data);
      if (!data.raw_text.trim()) throw Error('未能提取有效文字，请直接粘贴简历文本。');
      state.values.raw_text = data.raw_text;
      rawRevision++;
      state.reviewed = false;
      invalidateSelection();
      acceptPreview(data, response.isMock);
    });
  function manual() {
    if (!active() || state.busy || !state.values.raw_text.trim()) return;
    state.imported = true;
    state.aiStatus = 'manual';
    state.candidate = null;
    state.parseMock = null;
    state.reviewed = false;
    state.error = '';
    state.notice = '请对照原文手动填写，原文仍完整保留。填写后核对并保存。';
    show();
  }
  function apply(field: ResumeField) {
    if (!active() || state.busy || !fields.includes(field) || !state.candidate) return;
    // Only an explicit per-field action may replace a protected value.
    edit(field, state.candidate[field]);
    state.notice = '已采用此项解析建议，请重新核对后保存。';
    show();
  }
  const refresh = (offset = 0) =>
    task('refresh', async (valid) => {
      const response = await api.request<Resume[]>(
        `/api/v1/resumes?order=desc&limit=20&offset=${offset}`,
      );
      if (!valid()) return;
      if (!Array.isArray(response.data)) throw Error('保存记录列表无法读取。');
      state.rows = response.data.map((row) => checked(row, true));
      state.offset = offset;
    });
  function acceptSaved(data: Resume, isMock: boolean) {
    state.aiStatus = 'idle';
    state.imported = true;
    state.values = editable(data);
    state.savedId = data.id;
    state.savedSnapshot = fingerprint(data);
    state.protectedFields = [...fields];
    state.reviewed = true;
    state.candidate = null;
    state.parseMock = isMock;
    state.pendingSave = null;
    state.rows = [data, ...state.rows.filter((row) => row.id !== data.id)].slice(0, 20);
    updateSelection({ resumeId: data.id, result: null });
  }
  async function load(identifier: string, discard = false) {
    refreshDirty();
    if (!active() || state.busy || !identifier) return;
    if (state.dirty && !discard) return { requiresConfirmation: true };
    return task('load', async (valid) => {
      const response = await api.request<Resume>(
        '/api/v1/resumes/' + encodeURIComponent(identifier),
      );
      if (!valid()) return;
      const data = checked(response.data, true);
      if (data.id !== identifier) throw Error('服务返回了另一份简历，当前内容已保留。');
      acceptSaved(data, response.isMock === true);
      state.notice = '已打开历史简历，确认过的内容会保留。';
    });
  }
  const save = () =>
    task('save', async (valid) => {
      const payload = resumePayload(state.values);
      if (!payload.raw_text.trim()) throw Error('请填写简历原文。');
      if (!state.reviewed) throw Error('请先核对并确认结构化内容。');
      if (
        payload.skills.length > 500 ||
        payload.experience.length > 500 ||
        payload.skills.some((x) => x.length > 200)
      ) {
        throw Error('技能与经历各最多 500 项，每项技能最多 200 字。');
      }
      const snapshot = fingerprint(payload);
      if (state.savedSnapshot === snapshot && state.savedId && !state.pendingSave) {
        updateSelection({ resumeId: state.savedId, result: null });
        state.notice = '内容与保存版本一致，已选择用于岗位匹配。';
        return;
      }
      let identifier = state.pendingSave?.snapshot === snapshot ? state.pendingSave.id : null;
      if (!identifier) {
        const saved = await api.request<Resume>('/api/v1/resumes', {
          method: 'POST',
          body: payload,
        });
        if (!valid()) return;
        const data = checked(saved.data, true);
        state.pendingSave = { id: data.id, snapshot };
        state.savedId = data.id;
        identifier = data.id;
      }
      let response;
      try {
        response = await api.request<Resume>('/api/v1/resumes/' + encodeURIComponent(identifier));
      } catch {
        throw Error('保存已成功，但重新读取未完成。内容已保留；再次点击保存将只重试读取。');
      }
      if (!valid()) return;
      const reread = checked(response.data, true);
      if (reread.id !== identifier || fingerprint(reread) !== snapshot) {
        throw Error('重新读取内容与确认值不一致，尚未选择用于匹配。请重试读取或检查服务。');
      }
      acceptSaved(reread, response.isMock === true);
      state.notice = '简历已保存，接下来选择目标岗位。';
    });
  function reset(discard = false) {
    refreshDirty();
    if (!active() || state.busy) return;
    if (state.dirty && !discard) return { requiresConfirmation: true };
    invalidateSelection();
    rawRevision++;
    state = {
      ...state,
      values: blankValues(),
      protectedFields: [],
      reviewed: false,
      candidate: null,
      aiStatus: 'idle',
      imported: false,
      parseMock: null,
      savedId: null,
      savedSnapshot: null,
      pendingSave: null,
      error: '',
      notice: '已开始一份新简历。',
    };
    show();
  }
  function clearFields() {
    if (!active() || state.busy) return;
    invalidateSelection();
    state = {
      ...state,
      values: { ...blankValues(), raw_text: state.values.raw_text },
      protectedFields: [],
      reviewed: false,
      candidate: null,
      imported: true,
      savedId: null,
      savedSnapshot: null,
      pendingSave: null,
      parseMock: null,
      aiStatus: 'manual',
      error: '',
      notice: '已清空字段，原文保留。可重新识别或手动填写。',
    };
    show();
  }
  function getDraft(): ResumeDraft {
    const {
      aiStatus,
      imported,
      values,
      protectedFields,
      reviewed,
      candidate,
      parseMock,
      savedId,
      savedSnapshot,
      pendingSave,
    } = state;
    return structuredClone({
      aiStatus,
      imported,
      values,
      protectedFields,
      reviewed,
      candidate,
      parseMock,
      savedId,
      savedSnapshot,
      pendingSave,
    });
  }
  function dispose() {
    disposed = true;
    ticket++;
    signal.removeEventListener('abort', dispose);
  }
  signal.addEventListener('abort', dispose, { once: true });
  show();
  return {
    edit,
    review,
    parse,
    upload,
    manual,
    apply,
    refresh,
    load,
    save,
    reset,
    clearFields,
    getDraft,
    dispose,
    async init() {
      await refresh();
      const identifier = getState().resumeId;
      if (active() && identifier && !state.dirty && identifier !== state.savedId)
        await load(identifier);
    },
  };
}
export type ResumeController = ReturnType<typeof connectResume>;
