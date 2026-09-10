// Public REST v1 response shapes; IDs are opaque and scores come only from FastAPI.
export interface ResumeData {
  raw_text: string;
  name: string | null;
  education: string;
  skills: string[];
  experience: string[];
}
export interface Resume extends ResumeData {
  id: string;
}
export type SourceType = 'real' | 'course' | 'synthetic' | 'unknown';
export interface JDSource {
  source_type: SourceType;
  source_url: string | null;
  source_name: string | null;
  collected_at: string | null;
}
export interface JD extends JDSource {
  id: string;
  title: string;
  company: string | null;
  jd_text: string;
  skills: string[];
  tools: string[];
  salary: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  salary_period: string | null;
}
export type JDCreate = Pick<JD, 'title' | 'jd_text'> &
  Partial<Omit<JD, 'id' | 'title' | 'jd_text'>>;
export interface Pair {
  resume_id: string;
  jd_id: string;
}
export interface MatchRecord extends Pair {
  id: string;
  score: number;
  keyword_score?: number | null;
  ai_assessment?: {
    score: number;
    summary: string;
    model: string;
    dimensions: {
      dimension: 'skills' | 'experience' | 'education';
      applicable: boolean;
      score: number;
      reason: string;
      jd_quotes: string[];
      resume_quotes: string[];
    }[];
  } | null;
  matched_skills: string[];
  missing_skills: string[];
  gap_analysis: string[];
  is_mock: boolean;
}
export interface DiagnosisRecord extends Pair {
  id: string;
  summary: string;
  suggestions: string[];
  is_mock: boolean;
}
export interface WorkflowResult {
  match: MatchRecord;
  diagnosis: DiagnosisRecord;
}
export interface SkillFrequency {
  skill: string;
  job_count: number;
  share_percent: number;
}
export interface SalaryGroup {
  currency: string;
  period: string;
  sample_size: number;
  ranges: { jd_id: string; title: string; lower: number; upper: number }[];
}
export interface MarketJob extends JDSource {
  jd_id: string;
  title: string;
  company: string | null;
  skills: string[];
  salary: string | null;
  salary_status: 'comparable' | 'missing_range' | 'missing_unit';
}
export interface MarketAnalysis {
  sample_size: number;
  company_count: number;
  unknown_company_count: number;
  source_counts: Record<string, number>;
  collected_from: string | null;
  collected_to: string | null;
  undated_count: number;
  skill_frequency: SkillFrequency[];
  jobs: MarketJob[];
  salary_coverage: {
    comparable_count: number;
    missing_range_count: number;
    missing_unit_count: number;
  };
  salary_groups: SalaryGroup[];
  observations: string[];
}
export interface AnalysisResponse {
  summary: string;
  skills: Record<string, number>;
  is_mock: boolean;
  market: MarketAnalysis | null;
  scope: {
    source_type: SourceType | null;
    date_from: string | null;
    date_to: string | null;
    available_count: number;
    selected_count: number;
    mock_count: number;
    excluded_mock_count: number;
  } | null;
}
export type Modules = Record<
  'resume' | 'jobs' | 'diagnosis' | 'analytics',
  { is_mock: boolean; provider?: string }
>;
export interface Demo {
  resume: Resume;
  jobs: JD[];
}
