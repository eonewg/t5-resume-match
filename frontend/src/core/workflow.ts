import { ApiError, type Api } from './api';
import type { WorkspaceState } from './state';

export async function runWorkflow(
  api: Api,
  input: { resumeText: string; title: string; company?: string; jdText: string },
  onStep: (message: string) => void = () => {},
): Promise<WorkspaceState> {
  const resumeText = input.resumeText.trim();
  const title = input.title.trim();
  const jdText = input.jdText.trim();
  if (!resumeText || !title || !jdText) throw new ApiError('请填写简历、岗位名称和岗位描述。');
  onStep('正在保存并解析简历…');
  const resume = await api.createResume(resumeText);
  if (!resume.data?.id) throw new ApiError('简历未返回有效编号，请重试。');
  onStep('正在保存目标岗位…');
  const job = await api.createJob({
    title,
    company: input.company?.trim() || null,
    jd_text: jdText,
  });
  if (!job.data?.id) throw new ApiError('岗位未返回有效编号，请重试。');
  onStep('正在生成匹配结果与诊断建议…');
  const result = await api.workflow({ resume_id: resume.data.id, jd_id: job.data.id });
  if (!result.data?.match || !result.data?.diagnosis)
    throw new ApiError('诊断结果不完整，请重试。');
  return {
    resumeId: resume.data.id,
    jdId: job.data.id,
    result: result.data,
    isMock:
      resume.isMock || job.isMock || result.data.match.is_mock || result.data.diagnosis.is_mock,
  };
}
