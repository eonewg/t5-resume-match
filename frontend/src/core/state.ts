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
export function createWorkspace() {
  let state: WorkspaceState = { resumeId: null, jdId: null, result: null, isMock: true };
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
      if (changed && !('result' in update)) state.result = null;
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
export function nextStep(state: WorkspaceState) {
  if (!state.resumeId) return 0;
  if (!state.jdId) return 1;
  const pairMatches = (record: MatchRecord | DiagnosisRecord | null | undefined) =>
    record?.resume_id === state.resumeId && record?.jd_id === state.jdId;
  if (!pairMatches(state.result?.match)) return 2;
  if (!pairMatches(state.result?.diagnosis)) return 3;
  return 4;
}
