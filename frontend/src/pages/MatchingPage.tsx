import Icon from '../components/Icon';
import { Link } from 'react-router-dom';
import { connectJobs, type JobsController } from '../modules/jobs/controller.ts';
import { useController, useWorkspace } from '../core/WorkspaceContext';
import { Button, Empty, Feedback, PageHeading } from '../components/ui';

const start = (controller: JobsController) => {
  void controller.load();
};
export default function MatchingPage() {
  const { state: s, controller } = useController(connectJobs, start, 'matching');
  const { store } = useWorkspace();
  if (!s) return <p role="status">正在读取匹配分析…</p>;
  const c = controller.current!;
  const job = s.jobs.find((row) => row.id === s.jdId);
  const resume = s.resumes.find((row) => row.id === s.resumeId);
  const r = s.result;
  const ready = Boolean(s.resumeId && s.jdId);
  return (
    <div className="product-page matching-page" data-module="matching">
      <PageHeading title="匹配分析">先看结论，再看证据和差距。</PageHeading>
      {ready && (
        <div className="pair-context panel">
          <div>
            <span className="material-icon">
              <Icon name="jobs" />
            </span>
            <span>
              <small>目标岗位</small>
              <strong>{job?.title || '已选择岗位'}</strong>
              <small>{job?.company || '公司暂未提供'}</small>
            </span>
          </div>
          <Icon name="swap" />
          <div>
            <span className="material-icon">
              <Icon name="resume" />
            </span>
            <span>
              <small>匹配简历</small>
              <strong>{resume?.name || '我的简历'}</strong>
              <small>{resume?.education || '已确认简历'}</small>
            </span>
          </div>
          <Link to="/jobs">
            更换简历或岗位 <Icon name="arrow" />
          </Link>
        </div>
      )}
      <Feedback id="jobs-status" error={s.error} busy={s.busy}>
        {s.busy ? '正在对照简历与岗位技能…' : s.notice}
      </Feedback>
      {!ready ? (
        <Empty title="还没有匹配结果" to="/jobs" cta="选择目标岗位">
          选择一份已确认的简历和目标岗位后，即可查看匹配度和差距。
        </Empty>
      ) : (
        !r && (
          <section className="product-empty">
            <h2>{job?.title || '已选择目标岗位'}</h2>
            <p>根据当前简历与岗位要求计算匹配，不改变已保存内容。</p>
            <Button id="jobs-run" tone="primary" disabled={s.busy} onClick={() => void c.match()}>
              {s.error ? '重试匹配' : '开始匹配'}
            </Button>
          </section>
        )
      )}
      {r && (
        <section id="jobs-result" className="match-result">
          <header className="match-overview">
            <div className="match-score-column">
              <h2>匹配度</h2>
              <p id="match-score" className="match-score">
                {r.is_mock ? '—' : r.score}
                <span>{r.is_mock ? '' : '%'}</span>
              </p>
              {!r.is_mock && (
                <div className="score-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, r.score))}%` }} />
                </div>
              )}
              <p id="score-caption" className="helper-text">
                {r.is_mock ? 'Mock · 演示数据，不展示真实分数' : '关键词与能力覆盖 · 满分 100'}
              </p>
            </div>
            <div className="match-target">
              <h3>
                {r.is_mock
                  ? '当前为演示匹配，请以真实简历分析为准。'
                  : `简历已体现 ${r.matched_skills.length} 项岗位技能，${r.missing_skills.length ? `还有 ${r.missing_skills.length} 项可结合真实经历补充。` : '暂未发现待补充的技能项。'}`}
              </h3>
              <p>{job?.title || '当前目标岗位'} · 结合下方证据，找出与岗位相关的经历和能力。</p>
            </div>
            <blockquote>
              “更好的机会
              <br />
              从清晰的对比开始。”<cite>—— T5</cite>
            </blockquote>
          </header>
          <div className="ability-grid">
            {(
              [
                ['已匹配能力', r.matched_skills, 'matched', 'matched-skills'],
                ['主要差距', r.missing_skills, 'missing', 'missing-skills'],
              ] as const
            ).map(([label, values, tone, id]) => (
              <section className={tone} key={id}>
                <h3>
                  <span className="ability-symbol">
                    {tone === 'matched' ? <Icon name="check" /> : '!'}
                  </span>
                  {label} <small>（{values.length}项）</small>
                </h3>
                <ul id={id} className="skill-list">
                  {values.length ? (
                    values.map((value, i) => (
                      <li key={i}>
                        <span className="ability-symbol">
                          {tone === 'matched' ? <Icon name="check" /> : '!'}
                        </span>
                        <strong>{value}</strong>
                        <span className="skill-explanation">
                          {tone === 'matched'
                            ? '简历中已体现该岗位技能'
                            : '简历中暂未体现，可结合真实经历补充'}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="helper-text">暂无</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
          <div className="match-reading-layout">
            <section className="match-evidence">
              <h3>
                <Icon name="chart" />
                评分依据
              </h3>
              <ul id="gap-analysis">
                {r.gap_analysis.slice(0, 3).map((value, i) => (
                  <li key={i}>{value}</li>
                ))}
              </ul>
              {r.gap_analysis.length > 3 && (
                <details className="more-evidence">
                  <summary>展开其余 {r.gap_analysis.length - 3} 条依据</summary>
                  <ul>
                    {r.gap_analysis.slice(3).map((value, i) => (
                      <li key={i}>{value}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
            <section className="match-next panel">
              <h3>
                <Icon name="diagnosis" />
                下一步建议
              </h3>
              <p>
                <span className="step-number">1</span>
                <strong>针对这个岗位优化简历</strong>
              </p>
              <p className="helper-text">基于匹配结果，突出相关经历，补充关键技能描述。</p>
              <div className="inline-actions">
                <Link
                  id="matching-optimize"
                  className="button primary"
                  to="/diagnosis"
                  onClick={() =>
                    store.updateSelection({
                      result: { ...store.getState().result, diagnosisRequested: true },
                    })
                  }
                >
                  针对这个岗位优化简历 →
                </Link>
                <Button tone="ghost" disabled={s.busy} onClick={() => void c.match()}>
                  重新匹配
                </Button>
              </div>{' '}
              <p>
                <span className="step-number">2</span>
                <strong>补强关键能力</strong>
              </p>
              <Link to="/resume">返回简历补充真实经历 →</Link>
              <p>
                <span className="step-number">3</span>
                <strong>探索其他岗位</strong>
              </p>
              <Link to="/jobs">重新选择目标岗位 →</Link>
            </section>
          </div>
          <p id="match-context-note" className="helper-text">
            简历未体现不代表你不会；请按真实经历补充。分数反映能力覆盖，不代表录用概率。
          </p>
        </section>
      )}
    </div>
  );
}
