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
  return (
    <div className="product-page diagnosis-page" data-module="diagnosis">
      <PageHeading eyebrow="04 / 打磨表达" title="AI 优化">
        针对当前岗位要求，让真实经历表达得更清晰。
      </PageHeading>
      {!s.canRun ? (
        <Empty title="先选择简历和目标岗位" to="/jobs" cta="去选择目标岗位" />
      ) : (
        <>
          <p className="selected-context" data-testid="diagnosis-selection">
            {selection}
          </p>
          <p className="gap-explanation">
            AI
            建议基于你确认的简历内容，仍需人工核实。建议不会自动覆盖原内容；缺失的事实和数字请自行核对补充。
          </p>
          <div className="inline-actions">
            <Button
              id="diagnosis-run"
              tone={r ? 'secondary' : 'primary'}
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
          </div>
        </>
      )}
      <Feedback error={s.error} busy={s.busy}>
        {s.busy ? '正在分析你的经历与目标岗位……' : ''}
      </Feedback>
      {s.error && (
        <div className="inline-actions">
          <NextLink to="/resume" primary={false}>
            修改简历
          </NextLink>
          <NextLink to="/jobs" primary={false}>
            修改岗位输入
          </NextLink>
        </div>
      )}
      <section data-testid="diagnosis-result" hidden={!r}>
        {r && (
          <>
            <section className="optimization-overview">
              <p
                className="status-badge"
                data-testid="diagnosis-result-mode"
                data-state={r.is_mock ? 'neutral' : 'success'}
              >
                {r.is_mock ? 'Mock · 演示数据，仅用于体验' : 'AI 生成结果 · 使用前请核实'}
              </p>
              <h2>总体建议</h2>
              <p id="diagnosis-summary" className="optimization-summary">
                {r.summary}
              </p>
            </section>
            {targeted.length > 0 && (
              <>
                <h2>当前岗位重点</h2>
                <ul className="suggestion-list">
                  {targeted.map((text, i) => (
                    <li key={i}>{text.slice(6)}</li>
                  ))}
                </ul>
              </>
            )}
            {comparisons.length > 0 && (
              <>
                <h2>经历优化</h2>
                {comparisons.map((text, i) => (
                  <Suggestion key={text + i} text={text} />
                ))}
              </>
            )}
            {other.length > 0 && (
              <>
                <h2>补充建议与核实提醒</h2>
                <ul id="diagnosis-suggestions" className="suggestion-list">
                  {other.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </>
            )}
            {!r.suggestions.length && <p>当前结果暂无具体建议。</p>}
            <NextLink to="/resume">返回我的简历核对修改 →</NextLink>
          </>
        )}
      </section>
      {s.canRun && (
        <details className="helper-disclosure">
          <summary>AI 服务说明</summary>
          <p data-testid="diagnosis-provider-mode">{mode}</p>
        </details>
      )}
    </div>
  );
}
