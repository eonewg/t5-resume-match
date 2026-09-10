import type { Api } from './api';
import type { Workspace, WorkspaceState } from './state';
import type { AnalysisResponse, DiagnosisRecord, JD, MatchRecord, Resume } from './contracts';
export interface ControllerContext extends Workspace {
  api: Api;
  signal: AbortSignal;
  view?: string;
}
export interface ResumeValues {
  raw_text: string;
  name: string;
  education: string;
  skills: string;
  experience: string[];
}
export type ResumeField = 'name' | 'education' | 'skills' | 'experience';
export interface ResumeDraft {
  values: ResumeValues;
  protectedFields: ResumeField[];
  reviewed: boolean;
  candidate: ResumeValues | null;
  acceptedSuggestions?: Partial<Record<ResumeField, string[]>>;
  aiStatus: 'idle' | 'success' | 'failed' | 'mock' | 'manual';
  imported: boolean;
  parseMock: boolean | null;
  savedId: string | null;
  savedSnapshot: string | null;
  pendingSave: { id: string; snapshot: string } | null;
}
export interface ResumeState extends ResumeDraft {
  rows: Resume[];
  offset: number;
  busy: string;
  error: string;
  notice: string;
  dirty: boolean;
  historyError: boolean;
}
export interface JobsState {
  jobs: JD[];
  resumes: Resume[];
  jdId: string;
  resumeId: string;
  result: MatchRecord | null;
  busy: boolean;
  error: string;
  notice: string;
  jobMock: boolean | null;
}
export interface DiagnosisState {
  current: WorkspaceState;
  record: DiagnosisRecord | null;
  busy: boolean;
  error: string;
  canRun: boolean;
}
export interface Filters {
  source_type: string;
  date_from: string;
  date_to: string;
}
export interface AnalyticsState {
  filters: Filters;
  result: AnalysisResponse | null;
  busy: string;
  error: string;
  notice: string;
}
