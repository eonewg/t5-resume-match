import type { JD, JDCreate } from '../../core/contracts';

export const jobLabels = {
  title: '岗位名称',
  company: '公司（选填）',
  source_url: '岗位链接（选填）',
  location: '工作地点',
  salary: '薪资待遇',
  education_requirement: '学历要求',
  experience_requirement: '经验要求',
  responsibilities: '岗位职责与目标',
  requirements: '任职要求',
  preferred_qualifications: '加分项',
  skills: '技能标签（用顿号或逗号分隔）',
  tools: '工具与框架（用顿号或逗号分隔）',
  jd_text: '岗位原文（保留备查）',
};
export type JobField = keyof typeof jobLabels;
export type JobValues = Record<JobField, string>;
export interface JobEditorDraft {
  values: JobValues;
  protectedFields: JobField[];
  candidate: JobValues | null;
  synthetic: boolean;
  savedId: string | null;
  savedSnapshot: string | null;
  sourceRecord?: JD;
}
export function emptyJobDraft(): JobEditorDraft {
  return {
    values: Object.fromEntries(Object.keys(jobLabels).map((key) => [key, ''])) as JobValues,
    protectedFields: [],
    candidate: null,
    synthetic: false,
    savedId: null,
    savedSnapshot: null,
  };
}
export function jobValues(data: JDCreate): JobValues {
  return Object.fromEntries(
    Object.keys(jobLabels).map((key) => {
      const value =
        key === 'jd_text' ? data.original_text || data.jd_text : data[key as keyof JDCreate];
      return [key, Array.isArray(value) ? value.join('、') : value || ''];
    }),
  ) as JobValues;
}
export function openJobDraft(record: JD): JobEditorDraft {
  const draft: JobEditorDraft = {
    ...emptyJobDraft(),
    values: jobValues(record),
    protectedFields: Object.keys(jobLabels).filter((key) => key !== 'jd_text') as JobField[],
    synthetic: record.source_type === 'synthetic',
    sourceRecord: structuredClone(record),
    savedId: record.id,
  };
  draft.savedSnapshot = JSON.stringify(jobPayload(draft));
  return draft;
}
export function jobDraftDirty(draft: JobEditorDraft): boolean {
  return (
    Object.values(draft.values).some(Boolean) &&
    JSON.stringify(jobPayload(draft)) !== draft.savedSnapshot
  );
}
export function applyJobPreview(draft: JobEditorDraft, data: JDCreate): JobEditorDraft {
  const candidate = jobValues(data);
  const values = { ...draft.values };
  for (const key of Object.keys(jobLabels) as JobField[]) {
    if (key === 'jd_text' || !draft.protectedFields.includes(key)) values[key] = candidate[key];
  }
  return { ...draft, values, candidate, savedId: null, savedSnapshot: null };
}
export function jobPayload(draft: JobEditorDraft): JDCreate {
  const values = draft.values;
  const tags = (value: string) =>
    value
      .split(/[、,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const source = draft.sourceRecord;
  return {
    ...(source
      ? {
          source_name: source.source_name,
          collected_at: source.collected_at,
          ...(values.salary === (source.salary || '')
            ? {
                salary_min: source.salary_min,
                salary_max: source.salary_max,
                currency: source.currency,
                salary_period: source.salary_period,
              }
            : {}),
        }
      : {}),
    ...values,
    source_url: values.source_url.trim() || null,
    company: values.company || null,
    salary: values.salary || null,
    original_text: values.jd_text,
    skills:
      values.skills || draft.protectedFields.includes('skills') || draft.candidate
        ? tags(values.skills)
        : undefined,
    tools:
      values.tools || draft.protectedFields.includes('tools') || draft.candidate
        ? tags(values.tools)
        : undefined,
    source_type: draft.synthetic ? 'synthetic' : source?.source_type || 'unknown',
  };
}
