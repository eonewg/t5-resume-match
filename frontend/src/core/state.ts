import type { DiagnosisRecord, MatchRecord } from './contracts';
export interface WorkspaceState {
  resumeId: string | null;
  jdId: string | null;
  result: {
    match?: MatchRecord | null;
    diagnosis?: DiagnosisRecord | null;
    diagnosisRequested?: boolean;
  } | null;
  isMock: boolean;
}
export function createWorkspace({ now = Date.now }: { now?: () => number } = {}) {
  let state: WorkspaceState = { resumeId: null, jdId: null, result: null, isMock: true };
  const cache = new Map<string, { result: WorkspaceState['result']; expires: number }>();
  const pairKey = (value: WorkspaceState) => JSON.stringify([value.resumeId, value.jdId]);
  const listeners = new Set<(state: WorkspaceState) => void>();
  const getState = () => structuredClone(state);
  return {
    getState,
    updateSelection(update: Partial<WorkspaceState>) {
      if (
        Object.keys(update).some((key) => !['resumeId', 'jdId', 'result', 'isMock'].includes(key))
      )
        throw Error('Unknown workspace field');
      const changed =
        ('resumeId' in update && update.resumeId !== state.resumeId) ||
        ('jdId' in update && update.jdId !== state.jdId);
      state = { ...state, ...structuredClone(update) };
      for (const [key, entry] of cache) if (entry.expires <= now()) cache.delete(key);
      if (changed && !('result' in update)) {
        state.result = structuredClone(cache.get(pairKey(state))?.result || null);
        state.isMock = state.result?.match?.is_mock ?? state.result?.diagnosis?.is_mock ?? true;
      }
      if (!changed && update.result && (update.result.match || update.result.diagnosis)) {
        const saved = {
          match: update.result.match || null,
          diagnosis: update.result.diagnosis || null,
        };
        const previous = cache.get(pairKey(state));
        cache.delete(pairKey(state));
        cache.set(pairKey(state), {
          result: structuredClone(saved),
          expires:
            previous && JSON.stringify(previous.result) === JSON.stringify(saved)
              ? previous.expires
              : now() + 30 * 60 * 1000,
        });
        if (cache.size > 20) cache.delete(cache.keys().next().value!);
      }
      listeners.forEach((listener) => listener(getState()));
    },
    subscribe(listener: (state: WorkspaceState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export type Workspace = ReturnType<typeof createWorkspace>;
export const steps = [
  { path: '/resume', title: '确认简历', detail: '导入原文，核对真实经历' },
  { path: '/jobs', title: '选择目标岗位', detail: '确定这次准备申请的方向' },
  { path: '/matching', title: '查看匹配与缺口', detail: '看清简历已体现与待补内容' },
  { path: '/diagnosis', title: '针对岗位优化', detail: '核实建议，打磨真实表达' },
];
export function completedSteps(state: WorkspaceState) {
  const pairMatches = (record: MatchRecord | DiagnosisRecord | null | undefined) =>
    Boolean(
      state.resumeId &&
      state.jdId &&
      record?.resume_id === state.resumeId &&
      record?.jd_id === state.jdId,
    );
  return [
    Boolean(state.resumeId),
    Boolean(state.jdId),
    pairMatches(state.result?.match),
    pairMatches(state.result?.diagnosis),
  ];
}
export function nextStep(state: WorkspaceState) {
  const complete = completedSteps(state);
  if (!complete[0]) return 0;
  if (!complete[1]) return 1;
  if (complete[3]) return 4;
  return complete[2] ? 3 : 2;
}
