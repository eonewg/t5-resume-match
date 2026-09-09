import { useEffect, useState } from 'react';
import { connectDiagnosis, type DiagnosisController } from '../modules/diagnosis/controller.ts';
import { useController, useWorkspace } from '../core/WorkspaceContext';
import { createApi } from '../core/api';
import type { JD, Resume } from '../core/contracts';
import { splitSuggestion } from '../core/presentation.ts';
import { Button, Empty, Feedback, NextLink, PageHeading } from '../components/ui';

const start = (controller: DiagnosisController) => {
  void controller.startRequested();
};
function Suggestion({ text }: { text: string }) {
  const parts = splitSuggestion(text);
  const [copied, setCopied] = useState('');
  if (!parts) return <li>{text}</li>;
  return (
    <article className="suggestion-entry">
      <div className="suggestion-compare">
        <section>
          <h3>原文</h3>
          <p>{parts.original}</p>
        </section>
        <section>
          <h3>建议表达</h3>
          <p>
            {parts.suggested
              .split(/(【(?:待补充|待核实|待确认)[^】]*】)/g)
              .map((part, i) =>
                /^【(?:待补充|待核实|待确认)/.test(part) ? (
                  <mark key={i}>{part}</mark>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
          </p>
        </section>
      </div>
      <div className="suggestion-reason">
        <h3>为什么这样改</h3>
        <p>{parts.reason}</p>
      </div>
      <div className="inline-actions">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(parts.suggested);
              setCopied('已复制，请核实后在简历中修改。');
            } catch {
              setCopied('复制未成功，请选择建议文字手动复制。');
            }
          }}
        >
          复制建议
        </Button>
        <span className="copy-status" role="status">
          {copied}
        </span>
      </div>
    </article>
  );
}
export default function DiagnosisPage() {
  const { state: s, controller } = useController(connectDiagnosis, start, 'diagnosis');
  const { state: workspace } = useWorkspace();
  const [selection, setSelection] = useState('');
  const [mode, setMode] = useState('正在读取服务状态…');
  useEffect(() => {
    const abort = new AbortController();
    const api = createApi({ signal: abort.signal });
    setSelection('正在读取目标岗位…');
    if (workspace.resumeId && workspace.jdId)
      Promise.all([
        api.request<Resume>('/api/v1/resumes/' + encodeURIComponent(workspace.resumeId)),
        api.request<JD>('/api/v1/jobs/' + encodeURIComponent(workspace.jdId)),
      ])
        .then(([resume, job]) => {
          if (!abort.signal.aborted)
            setSelection(
              `针对：${job.data.title}${job.data.company ? ' · ' + job.data.company : ''} · ${resume.data.name || '我的简历'}`,
            );
        })
        .catch(() => {
          if (!abort.signal.aborted) setSelection('已选择简历与目标岗位，名称暂时无法读取。');
        });
    api
      .modules()
      .then(({ data }) => {
        if (!abort.signal.aborted)
          setMode(
            data.diagnosis.is_mock
              ? 'Mock · 当前使用演示服务，结果仅用于体验。'
              : '生成建议时，将把所选简历与岗位内容发送给已配置的智能服务。',
          );
      })
      .catch(() => {
        if (!abort.signal.aborted) setMode('暂时无法读取服务状态。');
      });
    return () => abort.abort();
  }, [workspace.resumeId, workspace.jdId]);
  if (!s) return <p role="status">正在准备优化页面…</p>;
  const r = s.record;
  const targeted = r?.suggestions.filter((t) => t.startsWith('【岗位建议】')) || [];
  const comparisons = r?.suggestions.filter((t) => splitSuggestion(t)) || [];
  const other =
    r?.suggestions.filter((t) => !t.startsWith('【岗位建议】') && !splitSuggestion(t)) || [];
  // Condense for scanning only; complete source text remains available below.
  const sentence = (text: string) => {
    const cleaned = text.replace(/^【[^】]*】\s*/, '').trim();
    const first = cleaned.split(/(?<=[。！？])|\n/)[0];
    return first.length > 90 ? first.slice(0, 90) + '…' : first;
  };
  const priorities = [
    ...new Set(
      [
        ...targeted.map(sentence),
        ...comparisons.map((text) => sentence(splitSuggestion(text)!.reason)),
        ...other
          .filter((text) => !/^(?:【[^】]*】)?(?:请核实|注意|提醒|风险)/.test(text))
          .map(sentence),
      ].filter(Boolean),
    ),
  ].slice(0, 3);
  return (
    <div className="product-page diagnosis-page" data-module="diagnosis">
      <PageHeading eyebrow="04 / 打磨表达" title="AI 优化">
        对照建议修改表达，保留真实经历。
      </PageHeading>
      {!s.canRun ? (
        <Empty title="先选择简历和目标岗位" to="/jobs" cta="去选择目标岗位" />
      ) : (
        <section className="diagnosis-header card">
          <p className="selected-context" data-testid="diagnosis-selection">
            {selection}
          </p>
          {r && (
            <>
              <p id="diagnosis-summary" className="optimization-summary">
                {sentence(r.summary)}
              </p>
              {sentence(r.summary) !== r.summary && (
                <details className="summary-full">
                  <summary>查看完整总结</summary>
                  <p>{r.summary}</p>
                </details>
              )}
            </>
          )}
          <div className="inline-actions">
            <Button
              id="diagnosis-run"
              tone="primary"
              disabled={s.busy}
              onClick={() => void controller.current?.run()}
            >
              {s.busy
                ? '正在生成建议…'
                : s.error
                  ? '重试生成建议'
                  : r
                    ? '重新生成建议'
                    : '生成优化建议'}
            </Button>
            <NextLink to="/resume" primary={false}>
              返回简历修改
            </NextLink>
          </div>
        </section>
      )}
      <Feedback error={s.error} busy={s.busy}>
        {s.busy ? '正在分析你的经历与目标岗位……' : ''}
      </Feedback>
      {s.error && (
        <NextLink to="/jobs" primary={false}>
          修改岗位输入
        </NextLink>
      )}
      <section data-testid="diagnosis-result" hidden={!r}>
        {r && (
          <>
            <p
              className="result-provenance"
              data-testid="diagnosis-result-mode"
              hidden={!r.is_mock}
            >
              Mock · 演示数据，仅用于体验
            </p>
            {priorities.length > 0 && (
              <section className="priority-panel card" aria-labelledby="priority-title">
                <div className="section-heading">
                  <h2 id="priority-title">优先修改</h2>
                  <span className="helper-text">先从这 {priorities.length} 项开始</span>
                </div>
                <ol className="priority-list">
                  {priorities.map((text, i) => (
                    <li key={i}>
                      <span aria-hidden="true">{i + 1}</span>
                      <p>{text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {comparisons.length > 0 && (
              <section className="experience-improvements" aria-labelledby="experience-title">
                <div className="section-heading">
                  <h2 id="experience-title">经历优化</h2>
                  <span className="helper-text">共 {comparisons.length} 条对照建议</span>
                </div>
                {comparisons.slice(0, 2).map((text, i) => (
                  <Suggestion key={text + i} text={text} />
                ))}
                {comparisons.length > 2 && (
                  <details className="additional-experiences">
                    <summary>查看其余 {comparisons.length - 2} 条经历建议</summary>
                    {comparisons.slice(2).map((text, i) => (
                      <Suggestion key={text + i} text={text} />
                    ))}
                  </details>
                )}
              </section>
            )}
            {(targeted.length > 0 || other.length > 0) && (
              <details className="other-suggestions card">
                <summary>
                  其他建议与完整说明{' '}
                  <span className="count-label">{targeted.length + other.length}</span>
                </summary>
                {targeted.length > 0 && (
                  <section>
                    <h3>岗位重点</h3>
                    <ul className="suggestion-list">
                      {targeted.map((text, i) => (
                        <li key={i}>{text.slice(6)}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {other.length > 0 && (
                  <section>
                    <h3>补充建议与核实提醒</h3>
                    <ul id="diagnosis-suggestions" className="suggestion-list">
                      {other.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </details>
            )}
            {!r.suggestions.length && <p className="compact-empty">当前结果暂无具体建议。</p>}
          </>
        )}
      </section>
      {s.canRun && (
        <footer className="diagnosis-footnote">
          <p>建议不会自动覆盖简历。采用前请核实事实、数字与待补充内容。</p>
          <details className="helper-disclosure">
            <summary>服务说明</summary>
            <p data-testid="diagnosis-provider-mode">{mode}</p>
          </details>
        </footer>
      )}
    </div>
  );
}
