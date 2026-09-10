import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../core/api';
import type { JD, Resume } from '../core/contracts';
import { useWorkspace } from '../core/WorkspaceContext';
import Icon from './Icon';

export default function PairSelector({
  onChange,
}: {
  onChange?: (key: 'resumeId' | 'jdId', value: string) => void;
}) {
  const { state, store } = useWorkspace();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [jobs, setJobs] = useState<JD[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const api = createApi({ signal: abort.signal });
    setLoading(true);
    setError('');
    async function rows<T extends { id: string }>(path: string, selected: string | null) {
      const result: T[] = [];
      for (let offset = 0; ; offset += 100) {
        const batch = (await api.request<T[]>(`${path}?limit=100&offset=${offset}`)).data;
        result.push(...batch);
        if (batch.length < 100) break;
      }
      if (selected && !result.some((row) => row.id === selected))
        result.push((await api.request<T>(`${path}/${encodeURIComponent(selected)}`)).data);
      return result;
    }
    Promise.all([
      rows<Resume>('/api/v1/resumes', store.getState().resumeId),
      rows<JD>('/api/v1/jobs', store.getState().jdId),
    ])
      .then(([r, j]) => {
        if (!abort.signal.aborted) {
          setResumes(r);
          setJobs(j);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('选择列表暂时无法读取，当前选择已保留。');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [store, revision]);
  function choose(key: 'resumeId' | 'jdId', value: string) {
    if (!value || value === state[key]) return;
    if (onChange) onChange(key, value);
    else store.updateSelection({ [key]: value, isMock: true });
  }
  const resume = resumes.find((row) => row.id === state.resumeId);
  const job = jobs.find((row) => row.id === state.jdId);
  return (
    <section
      className="pair-selector"
      aria-label="简历与岗位快速选择"
      data-testid="diagnosis-selection"
    >
      <div className="pair-selector-fields">
        <div className="pair-selector-field">
          <span className="material-icon">
            <Icon name="resume" />
          </span>
          <div>
            <label htmlFor="quick-resume">当前简历</label>
            <select
              id="quick-resume"
              value={state.resumeId || ''}
              disabled={loading || !!error}
              onChange={(event) => choose('resumeId', event.target.value)}
            >
              <option value="" disabled>
                {loading ? '正在读取…' : '选择已保存的简历'}
              </option>
              {state.resumeId && !resume && <option value={state.resumeId}>已选择简历</option>}
              {resumes.map((row, index) => (
                <option key={row.id} value={row.id}>
                  {row.name || '未命名简历'} ·{' '}
                  {row.education?.split('\n')[0].slice(0, 45) || '教育信息未填写'} · 版本{' '}
                  {index + 1}
                </option>
              ))}
            </select>
            <p title={resume?.education}>
              {resume?.education ||
                (loading ? '正在读取简历信息…' : '选择用于本次分析的已保存版本')}
            </p>
            <Link to="/resume">返回简历编辑 →</Link>
          </div>
        </div>
        <div className="pair-selector-field">
          <span className="material-icon">
            <Icon name="target" />
          </span>
          <div>
            <label htmlFor="quick-job">目标岗位</label>
            <select
              id="quick-job"
              value={state.jdId || ''}
              disabled={loading || !!error}
              onChange={(event) => choose('jdId', event.target.value)}
            >
              <option value="" disabled>
                {loading ? '正在读取…' : '选择已保存的岗位'}
              </option>
              {state.jdId && !job && <option value={state.jdId}>已选择岗位</option>}
              {jobs.map((row, index) => (
                <option key={row.id} value={row.id}>
                  {row.title} · {row.company || '公司未填写'} · {index + 1}
                </option>
              ))}
            </select>
            <p title={job?.company || ''}>
              {job?.company || (loading ? '正在读取岗位信息…' : '选择这次准备申请的岗位')}
            </p>
            <Link to="/jobs">返回岗位管理 →</Link>
          </div>
        </div>
      </div>
      <p className="pair-cache-note">
        同一组合的成功结果在当前页面会话中保留 30 分钟，切换回来可继续查看。
      </p>
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={() => setRevision(revision + 1)}>
            重新读取
          </button>
        </p>
      )}
    </section>
  );
}
