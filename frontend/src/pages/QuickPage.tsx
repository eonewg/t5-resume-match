import { useEffect, useRef, useState } from 'react';
import { createApi } from '../core/api';
import { runWorkflow } from '../core/workflow.ts';
import { useWorkspace } from '../core/WorkspaceContext';
import { Button, Chips, Feedback, NextLink, PageHeading } from '../components/ui';
import type { WorkspaceState } from '../core/state';

export default function QuickPage() {
  const { store, quick } = useWorkspace();
  const [form, setForm] = useState(
    quick.current?.form || { resumeText: '', title: '', company: '', jdText: '' },
  );
  const [result, setResult] = useState<WorkspaceState | null>(quick.current?.result || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(quick.current?.notice || '');
  useEffect(() => {
    quick.current = { form, result, notice };
  }, [form, result, notice, quick]);
  const abort = useRef(new AbortController());
  useEffect(() => {
    abort.current = new AbortController();
    return () => abort.current.abort();
  }, []);
  const api = () => createApi({ signal: abort.current.signal });
  function edit(key: keyof typeof form, value: string) {
    setForm({ ...form, [key]: value });
    setResult(null);
    setError('');
  }
  return (
    <section id="workspace-view">
      <PageHeading eyebrow="演示工具" title="快捷原文分析">
        保留的原文体验入口。会新建简历和诊断记录；已确认的简历请从主流程继续。
      </PageHeading>
      <NextLink to="/resume" primary={false}>
        进入我的简历 →
      </NextLink>
      <form
        id="workflow-form"
        aria-busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          setResult(null);
          try {
            const data = await runWorkflow(api(), form, setNotice);
            if (!abort.current.signal.aborted) {
              store.updateSelection(data);
              setResult(data);
              setNotice('本次结果已保存。');
            }
          } catch (failure) {
            if (!abort.current.signal.aborted)
              setError(failure instanceof Error ? failure.message : '请求失败');
          } finally {
            if (!abort.current.signal.aborted) setBusy(false);
          }
        }}
      >
        <div className="section-heading">
          <h2>快捷原文诊断</h2>
          <Button
            id="load-demo"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const { data } = await api().demo();
                if (!abort.current.signal.aborted) {
                  setForm({
                    resumeText: data.resume.raw_text,
                    title: data.jobs[0].title,
                    company: data.jobs[0].company || '',
                    jdText: data.jobs[0].jd_text,
                  });
                  setResult(null);
                  setNotice('已填入合成样例，不含真实个人或招聘信息。');
                }
              } catch (failure) {
                if (!abort.current.signal.aborted)
                  setError(failure instanceof Error ? failure.message : '请求失败');
              } finally {
                if (!abort.current.signal.aborted) setBusy(false);
              }
            }}
          >
            填入演示内容
          </Button>
        </div>
        <div className="input-grid">
          <section className="card input-card">
            <label htmlFor="resume-text">简历内容</label>
            <textarea
              id="resume-text"
              required
              maxLength={50000}
              rows={12}
              value={form.resumeText}
              readOnly={busy}
              onChange={(e) => edit('resumeText', e.target.value)}
            />
            <small id="resume-count">{form.resumeText.length} / 50000</small>
          </section>
          <section className="card input-card">
            <label htmlFor="job-title">岗位名称</label>
            <input
              id="job-title"
              required
              maxLength={200}
              readOnly={busy}
              value={form.title}
              onChange={(e) => edit('title', e.target.value)}
            />
            <label htmlFor="job-company">公司（选填）</label>
            <input
              id="job-company"
              readOnly={busy}
              value={form.company}
              onChange={(e) => edit('company', e.target.value)}
            />
            <label htmlFor="job-text">岗位描述</label>
            <textarea
              id="job-text"
              required
              maxLength={50000}
              rows={7}
              value={form.jdText}
              readOnly={busy}
              onChange={(e) => edit('jdText', e.target.value)}
            />
            <small id="job-count">{form.jdText.length} / 50000</small>
          </section>
        </div>
        <div className="action-bar">
          <p id="form-status" role="status">
            {notice}
          </p>
          <Button id="run-workflow" type="submit" tone="primary" disabled={busy}>
            开始诊断 →
          </Button>
        </div>
      </form>
      <Feedback id="workflow-error" error={error} />
      {result?.result?.match && result.result.diagnosis ? (
        <section id="results">
          <h2 id="results-title">本次诊断</h2>
          <p id="result-mode">{result.isMock ? 'Mock · 演示数据' : '诊断已完成'}</p>
          <div className="card detail-card">
            <strong id="match-score" className="score">
              {result.isMock ? '—' : result.result.match.score}
            </strong>
            <p id="score-caption">
              {result.isMock ? '演示结果，不展示真实匹配分数' : '匹配度 / 100'}
            </p>
            <h3>已匹配技能</h3>
            <Chips id="matched-skills" values={result.result.match.matched_skills} />
            <h3>简历未体现的技能</h3>
            <Chips id="missing-skills" values={result.result.match.missing_skills} />
            <ul id="gap-analysis">
              {result.result.match.gap_analysis.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
            <h3>诊断建议</h3>
            <p id="diagnosis-summary">{result.result.diagnosis.summary}</p>
            <ul id="diagnosis-suggestions">
              {result.result.diagnosis.suggestions.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <div id="empty-results" className="empty-results">
          提交后，匹配结果与诊断建议会显示在这里。
        </div>
      )}
    </section>
  );
}
