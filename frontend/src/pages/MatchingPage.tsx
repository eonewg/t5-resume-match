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
  const r = s.result;
  const ready = Boolean(s.resumeId && s.jdId);
  return (
    <div className="product-page matching-page" data-module="matching">
      <PageHeading eyebrow="03 / 看清差距" title="匹配分析">
        看清简历已经体现的能力，找到针对目标岗位的补充重点。
      </PageHeading>
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
          <div className="match-hero">
            <div>
              <h2>匹配度</h2>
              <p id="match-score" className="match-score">
                {r.is_mock ? '—' : r.score}
                <span>{r.is_mock ? '' : '%'}</span>
              </p>
              <p id="score-caption" className="helper-text">
                {r.is_mock ? 'Mock · 演示数据，不展示真实分数' : '关键词与能力覆盖 · 满分 100'}
              </p>
            </div>
            <div className="match-target">
              <p className="eyebrow">本次目标</p>
              <h3>{job?.title || '已选择岗位'}</h3>
              <p>{job?.company || '公司暂未提供'}</p>
              <p className="match-conclusion">
                {r.is_mock
                  ? '当前为演示匹配，请以真实简历分析为准。'
                  : `简历已体现 ${r.matched_skills.length} 项岗位技能，${r.missing_skills.length ? `还有 ${r.missing_skills.length} 项可结合真实经历补充。` : '暂未发现待补充的技能项。'}`}
              </p>
              <Link to="/jobs">更换目标岗位</Link>
            </div>
          </div>

          <div className="ability-grid">
            {(
              [
                ['已体现能力', r.matched_skills, 'matched', 'matched-skills'],
                ['简历尚未体现', r.missing_skills, 'missing', 'missing-skills'],
              ] as const
            ).map(([label, values, tone, id]) => (
              <section className={tone} key={id}>
                <h3>
                  {label} <span className="count-label">{values.length}</span>
                </h3>
                <ul id={id} className="skill-list">
                  {values.length ? (
                    values.map((value, i) => (
                      <li className="chip" key={i}>
                        {value}
                      </li>
                    ))
                  ) : (
                    <li className="helper-text">暂无</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
          <section className="match-evidence">
            <h3>差距分析与评分依据</h3>
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
          <p id="match-context-note" className="helper-text">
            简历未体现不代表你不会；请按真实经历补充。分数反映能力覆盖，不代表录用概率。
          </p>
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
            <Button disabled={s.busy} onClick={() => void c.match()}>
              重新匹配
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
