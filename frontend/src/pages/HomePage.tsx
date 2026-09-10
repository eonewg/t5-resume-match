import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../core/api';
import { analyticsTopics } from '../core/analytics-navigation';
import type { JD, Resume } from '../core/contracts';
import { useWorkspace } from '../core/WorkspaceContext';
import { completedSteps, nextStep, steps } from '../core/state';
import Icon from '../components/Icon';
import { NextLink } from '../components/ui';

export default function HomePage() {
  const { state, draft } = useWorkspace();
  const active = nextStep(state);
  const complete = completedSteps(state);
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
  return (
    <div className="home-page" data-module="home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="hero-greeting">
            {new Date().getHours() < 12
              ? '早上好'
              : new Date().getHours() < 18
                ? '下午好'
                : '晚上好'}
          </p>
          <h1 id="home-title" tabIndex={-1}>
            准备好开启下一次机会了吗？
          </h1>
          <p>从一份好简历开始，让你的经验被看见。</p>
          <div className="inline-actions">
            <NextLink id="home-next" to={step.path}>
              {ctas[active]} <Icon name="arrow" />
            </NextLink>
            <Link to="/jobs" className="hero-secondary">
              选择目标岗位
            </Link>
          </div>
        </div>
        <blockquote>
          “更好的机会
          <br />
          从清晰的表达开始。”<cite>—— Vitae</cite>
        </blockquote>
      </section>
      <section className="home-progress panel" aria-labelledby="progress-title">
        <h2 id="progress-title">当前进度</h2>
        <ol className="workflow-steps">
          {steps.map((item, i) => (
            <li
              key={item.path}
              data-state={complete[i] ? 'complete' : i === active ? 'current' : 'pending'}
            >
              <Link to={item.path}>
                <span className="step-number">{complete[i] ? <Icon name="check" /> : i + 1}</span>
                <span>
                  <strong>{['确认简历', '选择岗位', '查看匹配', 'AI 优化'][i]}</strong>
                  <small>
                    {complete[i]
                      ? [
                          '已确认',
                          '已选择',
                          state.result?.match?.is_mock ? '已查看演示' : '已生成分析',
                          state.result?.diagnosis?.is_mock ? '已生成演示建议' : '已生成建议',
                        ][i]
                      : ['上传或编辑', '设定目标', '尚未分析', '生成建议'][i]}
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section className="home-materials" aria-labelledby="home-materials-title">
        <h2 id="home-materials-title" className="sr-only">
          正在使用
        </h2>
        <div className="home-material-row">
          <h2 className="material-label">
            <Icon name="resume" />
            当前简历
          </h2>
          <span className="material-icon">
            <Icon name="resume" />
          </span>
          <div>
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
          </div>
          <div className="material-actions">
            <Link className="button primary" to="/resume">
              {state.resumeId ? '查看确认版本' : '上传简历'} <Icon name="arrow" />
            </Link>
            <Link className="button secondary" to="/resume/history">
              历史简历
            </Link>
          </div>
        </div>
        <div className="home-material-row">
          <h2 className="material-label">
            <Icon name="target" />
            当前目标
          </h2>
          <span className="material-icon">
            <Icon name="jobs" />
          </span>
          <div>
            <h2>{names.job || (state.jdId ? '正在读取…' : '尚未选择目标岗位')}</h2>
            <p>
              {state.result?.match
                ? state.result.match.is_mock
                  ? 'Mock · 本次匹配为演示结果，不提供真实评分。'
                  : `当前匹配度 ${state.result.match.score}% · ${state.result.match.missing_skills.length} 项技能尚未在简历中体现。`
                : '选择准备申请的岗位。'}
            </p>
          </div>
          <div className="material-actions">
            <Link className="button secondary accent" to="/jobs">
              {state.jdId ? '查看或更换目标' : '选择岗位'} <Icon name="arrow" />
            </Link>
            <Link className="button secondary" to="/analytics?tab=jobs">
              浏览岗位样本
            </Link>
          </div>
        </div>
      </section>
      <aside className="home-insight panel">
        <div className="section-heading">
          <div>
            <h2>
              <Icon name="chart" />
              市场洞察
            </h2>
            <p>了解岗位需求与热门技能，把握申请方向。</p>
          </div>
          <Link className="button secondary accent" to="/analytics">
            查看洞察 <Icon name="arrow" />
          </Link>
        </div>
        <div className="insight-links">
          {analyticsTopics.map((topic) => (
            <Link key={topic.id} to={`/analytics?tab=${topic.id}`}>
              <span className="material-icon">
                <Icon name={topic.icon} />
              </span>
              <span>
                <strong>{topic.label}</strong>
                <small>{topic.description}</small>
              </span>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
