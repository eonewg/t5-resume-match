import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../core/api';
import type { JD, Resume } from '../core/contracts';
import { useWorkspace } from '../core/WorkspaceContext';
import { nextStep, steps } from '../core/state';
import { NextLink } from '../components/ui';

export default function HomePage() {
  const { state, draft } = useWorkspace();
  const active = nextStep(state);
  const step = steps[Math.min(active, 3)];
  const [names, setNames] = useState({ resume: '', job: '' });
  useEffect(() => {
    const abort = new AbortController();
    const api = createApi({ signal: abort.signal });
    Promise.all([
      state.resumeId
        ? api
            .request<Resume>('/api/v1/resumes/' + encodeURIComponent(state.resumeId))
            .then((r) => r.data.name || '已确认简历')
        : Promise.resolve(''),
      state.jdId
        ? api
            .request<JD>('/api/v1/jobs/' + encodeURIComponent(state.jdId))
            .then((r) => r.data.title)
        : Promise.resolve(''),
    ])
      .then(([resume, job]) => {
        if (!abort.signal.aborted) setNames({ resume, job });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setNames({
            resume: state.resumeId ? '已选择的确认版本' : '',
            job: state.jdId ? '已选择的目标岗位' : '',
          });
      });
    return () => abort.abort();
  }, [state.resumeId, state.jdId]);
  const ctas = [
    draft.current?.values.raw_text ? '继续核对简历' : '从导入简历开始',
    '继续选择目标岗位',
    '查看匹配分析',
    '针对岗位优化简历',
    '查看建议并核实修改',
  ];
  const descriptions = [
    '上传或粘贴简历，先确认自己的真实经历。已有版本可以从历史简历中选择。',
    '简历已确认。接下来选一个准备申请的岗位，明确这次优化的方向。',
    '简历与目标已就绪。查看匹配分数和证据，找到值得补充的重点。',
    '匹配分析已就绪。结合岗位要求，生成基于真实经历的优化建议。',
    '建议已经生成。请逐项核实后手动修改简历，保存新版本后可再次匹配。',
  ];
  return (
    <div className="home-page" data-module="home">
      <h1 tabIndex={-1}>求职准备工作台</h1>
      <p className="home-lead">确认简历，选定岗位，完成一次有针对性的准备。</p>
      <section className="home-next card" aria-labelledby="home-next-title">
        <div>
          <p className="eyebrow">
            {active === 4 ? '已完成一次分析' : `下一步 · ${String(active + 1).padStart(2, '0')}`}
          </p>
          <h2 id="home-next-title">{active === 4 ? '核实建议，准备下一次匹配' : step.title}</h2>
          <p>{descriptions[active]}</p>
        </div>
        <NextLink id="home-next" to={step.path}>
          {ctas[active]} →
        </NextLink>
      </section>
      <section className="home-progress" aria-labelledby="progress-title">
        <div className="section-heading">
          <h2 id="progress-title">本次准备进度</h2>
          <span className="helper-text">{active} / 4 步就绪</span>
        </div>
        <ol className="workflow-steps">
          {steps.map((item, i) => (
            <li
              key={item.path}
              data-state={i < active ? 'complete' : i === active ? 'current' : 'pending'}
            >
              <Link to={item.path}>
                <span className="step-number" aria-hidden="true">
                  {i < active ? '✓' : `0${i + 1}`}
                </span>
                <strong>{item.title}</strong>

                <span className="step-status">
                  {i < active ? '已就绪' : i === active ? '进行这一步' : '待进行'}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <div className="home-context-grid">
        <section className="card context-card">
          <p className="eyebrow">当前简历</p>
          <h2>
            {names.resume ||
              (state.resumeId
                ? '正在读取…'
                : draft.current?.values.raw_text
                  ? '有待核对的简历草稿'
                  : '尚未确认简历')}
          </h2>
          <p>
            {state.resumeId ? '已确认，可用于岗位分析。' : '支持 PDF、DOCX、TXT 或直接粘贴原文。'}
          </p>
          <Link to="/resume">{state.resumeId ? '查看确认版本' : '导入或选择历史简历'} →</Link>
        </section>
        <section className="card context-card">
          <p className="eyebrow">当前目标</p>
          <h2>{names.job || (state.jdId ? '正在读取…' : '尚未选择目标岗位')}</h2>
          <p>
            {state.result?.match
              ? state.result.match.is_mock
                ? 'Mock · 本次匹配为演示结果，不提供真实评分。'
                : `当前匹配度 ${state.result.match.score}% · ${state.result.match.missing_skills.length} 项技能尚未在简历中体现。`
              : '选择准备申请的岗位。'}
          </p>
          <Link to="/jobs">{state.jdId ? '查看或更换目标' : '选择准备申请的岗位'} →</Link>
        </section>
      </div>
      <aside className="home-insight">
        <span>探索其他方向</span>
        <Link to="/analytics">市场洞察 ↗</Link>
      </aside>
    </div>
  );
}
