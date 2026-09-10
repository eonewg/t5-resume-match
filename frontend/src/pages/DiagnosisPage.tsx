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
  if (!parts) return <p className="suggestion-text">{text.replace(/^【岗位建议】/, '')}</p>;
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
      <p className="suggestion-reason">
        <span>为什么这样改</span>
        {parts.reason}
      </p>
    </article>
  );
}
function SuggestionWorkbench({ suggestions }: { suggestions: string[] }) {
  const unique = [...new Set(suggestions)];
  const groups = [
    { name: '经历表达', items: unique.filter((text) => splitSuggestion(text)) },
    {
      name: '岗位重点',
      items: unique.filter((text) => text.startsWith('【岗位建议】') && !splitSuggestion(text)),
    },
    {
      name: '补充与核实',
      items: unique.filter((text) => !text.startsWith('【岗位建议】') && !splitSuggestion(text)),
    },
  ].filter((group) => group.items.length);
  const [groupIndex, setGroupIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const group = groups[groupIndex];
  const current = group.items[itemIndex];
  return (
    <div className="optimization-workbench">
      <nav className="suggestion-categories" aria-label="建议分类">
        {groups.map((entry, index) => (
          <Button
            tone="ghost"
            key={entry.name}
            aria-pressed={index === groupIndex}
            onClick={() => {
              setGroupIndex(index);
              setItemIndex(0);
            }}
          >
            {entry.name}
            <span>{entry.items.length}</span>
          </Button>
        ))}
      </nav>
      <div className="suggestion-workspace">
        <aside className="suggestion-index" aria-label={`${group.name}建议列表`}>
          {group.items.map((text, index) => {
            const preview = splitSuggestion(text)?.original || text.replace(/^【[^】]*】/, '');
            return (
              <button
                type="button"
                key={index}
                aria-pressed={index === itemIndex}
                onClick={() => setItemIndex(index)}
              >
                <span className="suggestion-position">
                  {index + 1} / {group.items.length}
                </span>
                <span>{preview.length > 72 ? preview.slice(0, 72) + '…' : preview}</span>
              </button>
            );
          })}
        </aside>
        <section className="suggestion-reader" aria-label="当前建议" aria-live="polite">
          <header>
            <h2>{group.name}</h2>
            <span>
              第 {itemIndex + 1} 条，共 {group.items.length} 条
            </span>
          </header>
          <Suggestion text={current} />
          <footer className="suggestion-reader-actions">
            <NextLink to="/resume" primary={false}>
              返回简历修改 →
            </NextLink>
            {itemIndex < group.items.length - 1 && (
              <Button tone="ghost" onClick={() => setItemIndex(itemIndex + 1)}>
                下一条建议 →
              </Button>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
}
export default function DiagnosisPage() {
  const { state: s, controller } = useController(connectDiagnosis, start, 'diagnosis');
  const { state: workspace } = useWorkspace();
  const [selection, setSelection] = useState('');
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
    return () => abort.abort();
  }, [workspace.resumeId, workspace.jdId]);
  if (!s) return <p role="status">正在准备优化页面…</p>;
  const r = s.record;
  return (
    <div className="product-page diagnosis-page" data-module="diagnosis">
      <PageHeading title="AI 优化" />
      {!s.canRun ? (
        <Empty title="先选择简历和目标岗位" to="/jobs" cta="去选择目标岗位" />
      ) : (
        <section className="diagnosis-header">
          <p className="selected-context" data-testid="diagnosis-selection">
            {selection}
          </p>
          <div className="inline-actions">
            <Button
              id="diagnosis-run"
              tone={r ? 'ghost' : 'primary'}
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
            {!r?.suggestions.length && (
              <NextLink to="/resume" primary={false}>
                返回简历修改
              </NextLink>
            )}
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
            <p id="diagnosis-summary" className="optimization-summary">
              {r.summary}
            </p>
            {r.suggestions.length > 0 && (
              <SuggestionWorkbench key={r.id} suggestions={r.suggestions} />
            )}
            {!r.suggestions.length && <p className="compact-empty">当前结果暂无具体建议。</p>}
          </>
        )}
      </section>
      {s.canRun && (
        <footer className="diagnosis-footnote">
          <p>建议不会自动覆盖简历。采用前请核实事实、数字与待补充内容。</p>
        </footer>
      )}
    </div>
  );
}
