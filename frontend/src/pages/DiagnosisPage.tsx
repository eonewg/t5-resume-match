import PairSelector from '../components/PairSelector';
import Icon from '../components/Icon';
import { useState } from 'react';
import { connectDiagnosis, type DiagnosisController } from '../modules/diagnosis/controller.ts';
import { useController } from '../core/WorkspaceContext';
import {
  diagnosisNote,
  jobSuggestion,
  naturalRewrite,
  splitSuggestion,
} from '../core/presentation.ts';
import { Button, Empty, Feedback, NextLink, PageHeading } from '../components/ui';

const start = (controller: DiagnosisController) => {
  void controller.startRequested();
};
function Suggestion({ text }: { text: string }) {
  const parts = splitSuggestion(text);
  if (!parts)
    return <p className="suggestion-text">{diagnosisNote(text.replace(/^【岗位建议】/, ''))}</p>;
  return (
    <article className="suggestion-entry">
      <div className="suggestion-compare">
        <section>
          <h3>原文</h3>
          <p>{parts.original}</p>
        </section>
        <section>
          <h3>
            建议表达{' '}
            <small className="ai-label">
              <Icon name="diagnosis" />
              AI 建议
            </small>
          </h3>
          <p>
            {naturalRewrite(parts.suggested)
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
        <span>
          <Icon name="info" />
          为什么这样改
        </span>
        {diagnosisNote(parts.reason)}
      </p>
    </article>
  );
}
function SuggestionWorkbench({ suggestions }: { suggestions: string[] }) {
  const unique = [...new Set(suggestions)];
  const keywords = unique.filter((text) => text.startsWith('【关键词·待核实】'));
  const reminders = unique.filter(
    (text) =>
      !text.startsWith('【岗位建议】') &&
      !text.startsWith('【关键词·待核实】') &&
      !splitSuggestion(text),
  );
  const groups = [
    { kind: 'experience', name: '经历表达', items: unique.filter((text) => splitSuggestion(text)) },
    {
      kind: 'jobs',
      name: '岗位重点',
      items: unique.filter((text) => text.startsWith('【岗位建议】') && !splitSuggestion(text)),
    },
  ].filter((group) => group.items.length || (group.kind === 'jobs' && keywords.length));
  const [groupIndex, setGroupIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const group = groups[groupIndex];
  const current = group?.items[itemIndex];
  return (
    <div className="optimization-workbench">
      {groups.length > 0 && (
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
      )}
      {group?.kind === 'experience' ? (
        <div className="suggestion-workspace">
          <aside className="suggestion-index" aria-label={`${group.name}建议列表`}>
            {group.items.map((text, index) => {
              const preview = splitSuggestion(text)?.original || text.replace(/^【[^】]*】/, '');
              return (
                <button
                  type="button"
                  key={index}
                  aria-pressed={index === itemIndex}
                  title={preview}
                  onClick={() => setItemIndex(index)}
                >
                  <span className="suggestion-position">{String(index + 1).padStart(2, '0')}</span>
                  <span className="suggestion-preview">{preview}</span>
                </button>
              );
            })}
          </aside>
          <section className="suggestion-reader" aria-label="当前建议" aria-live="polite">
            <header>
              <h2>
                {group.name}{' '}
                <span className="suggestion-order">{String(itemIndex + 1).padStart(2, '0')}</span>
              </h2>
              <span>
                第 {itemIndex + 1} 条，共 {group.items.length} 条
              </span>
            </header>
            <Suggestion text={current} />
            <footer className="suggestion-reader-actions">
              <NextLink to="/resume">返回简历修改 →</NextLink>
              {itemIndex < group.items.length - 1 && (
                <Button tone="ghost" onClick={() => setItemIndex(itemIndex + 1)}>
                  下一条建议 →
                </Button>
              )}
            </footer>
          </section>
        </div>
      ) : group ? (
        <section className="suggestion-collection" aria-label={group.name}>
          <header>
            <div>
              <h2>{group.name}</h2>
              <p className="helper-text">先看具体怎么改，展开查看原因和对应经历。</p>
            </div>
            <NextLink to="/resume">返回简历修改 →</NextLink>
          </header>
          {group.items.length > 0 && (
            <ol className="suggestion-list job-actions">
              {group.items.map((text) => {
                const { headline, detail } = jobSuggestion(text);
                return (
                  <li key={text}>
                    {detail ? (
                      <details>
                        <summary>
                          <span>{headline}</span>
                          <small>展开说明</small>
                        </summary>
                        <p>{detail}</p>
                      </details>
                    ) : (
                      <p className="job-action-short">{headline}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {keywords.length > 0 && (
            <details className="suggestion-keywords suggestion-extra">
              <summary>岗位相关技能 · {keywords.length} 项</summary>
              <p className="helper-text">
                这些词用于对照上面的岗位建议，不代表你已经掌握，也不代表你都缺少。用过的技能可以补一个实际案例；没用过的可以作为学习方向，不必写进简历。
              </p>
              <ul>
                {keywords.map((text) => (
                  <li key={text}>{text.replace(/^【关键词·待核实】\s*/, '')}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ) : null}
      {reminders.length > 0 && (
        <details className="suggestion-reminders suggestion-extra">
          <summary>修改前的补充提示 · {reminders.length} 条</summary>
          <p className="helper-text">
            这里列出建议中仍需你确认的地方。与自己经历有关的再处理，不需要逐项打勾或把这些话写进简历。
          </p>
          <ul className="suggestion-list">
            {reminders.map((text) => (
              <li key={text}>
                <Icon name="info" />
                <Suggestion text={text.replace(/^【风险提醒】\s*/, '')} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
export default function DiagnosisPage() {
  const { state: s, controller } = useController(connectDiagnosis, start, 'diagnosis');
  if (!s) return <p role="status">正在准备优化页面…</p>;
  const r = s.record;
  return (
    <div className="product-page diagnosis-page" data-module="diagnosis">
      <div className="page-title-row">
        <PageHeading title="AI 优化">对照建议修改表达，保留真实经历。</PageHeading>
        {s.canRun && (
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
        )}
      </div>
      <PairSelector />
      {!s.canRun && <Empty title="先选择简历和目标岗位" to="/jobs" cta="去选择目标岗位" />}
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
          <p>建议不会自动覆盖简历。选择适合的表达，回到简历中修改并保存。</p>
        </footer>
      )}
    </div>
  );
}
