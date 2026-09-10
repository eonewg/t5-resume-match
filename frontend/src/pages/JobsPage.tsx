import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { connectJobs, type JobsController } from '../modules/jobs/controller.ts';
import { useController, useWorkspace } from '../core/WorkspaceContext';
import {
  Button,
  Chips,
  Empty,
  Feedback,
  NextLink,
  PageHeading,
  SafeSource,
} from '../components/ui';
import cpp from '../demo/fixtures/job-cpp.ts';
import go from '../demo/fixtures/job-go.ts';
import ml from '../demo/fixtures/job-ml.ts';

const start = (controller: JobsController) => {
  void controller.load();
};
export default function JobsPage() {
  const { state: s, controller } = useController(connectJobs, start, 'jobs');
  const navigate = useNavigate();
  const { store } = useWorkspace();
  const [formOpen, setFormOpen] = useState(false);
  const formPanel = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ title: '', company: '', jd_text: '' });
  const [demo, setDemo] = useState(false);
  const [operation, setOperation] = useState('load');
  if (!s) return <p role="status">正在读取目标岗位…</p>;
  const c = controller.current!;
  const job = s.jobs.find((row) => row.id === s.jdId);
  const resume = s.resumes.find((row) => row.id === s.resumeId);
  const visibleJobs = s.jobs.filter((row) =>
    [row.title, row.company, ...row.skills]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="product-page jobs-page" data-module="jobs">
      <PageHeading eyebrow="02 / 找准方向" title="目标岗位">
        选择你准备申请的岗位，让后续匹配和优化有一个具体目标。
      </PageHeading>
      {!s.resumeId ? (
        <Empty title="先导入一份简历" to="/resume" cta="导入简历">
          核对并保存后，就可以选择目标岗位。
        </Empty>
      ) : (
        <>
          <section className="current-resume">
            <div className="resume-monogram" aria-hidden="true">
              {resume?.name?.slice(0, 1) || '简'}
            </div>
            <div className="resume-identity">
              <span className="eyebrow">以这份经历，寻找下一站</span>
              <div>
                <strong>{resume?.name || '我的简历'}</strong>
                <span className="status-badge" data-state="success">
                  已确认简历
                </span>
              </div>
              <p>{resume?.education || '从你的真实经历出发'}</p>
            </div>
            <div className="resume-skill-preview">
              <Chips values={resume?.skills.slice(0, 4) || []} empty="在简历中补充你的技能" />
            </div>
            <Link className="resume-switch" to="/resume/history">
              更换简历 <span aria-hidden="true">⇄</span>
            </Link>
          </section>
          {job && (
            <section className="next-action card selected-job" data-testid="selected-job">
              <div>
                <span className="eyebrow">当前目标岗位</span>
                <h2>{job.title}</h2>
                <p>{job.company || '公司暂未提供'}</p>
                <Chips values={job.skills.slice(0, 5)} />
              </div>
              {!formOpen && (
                <Button
                  id="jobs-run"
                  tone="primary"
                  disabled={s.busy}
                  onClick={async () => {
                    setOperation('match');
                    await c.match();
                    if (controller.current === c && store.getState().result?.match)
                      navigate('/matching');
                  }}
                >
                  {s.busy && operation === 'match'
                    ? '正在匹配…'
                    : s.error && operation === 'match'
                      ? '重试匹配'
                      : '用当前简历分析这个岗位'}
                </Button>
              )}
            </section>
          )}
          <section aria-labelledby="job-choice-title">
            <div className="section-heading">
              <h2 id="job-choice-title">选择目标岗位</h2>
              <div className="job-collection-tools">
                <span className="helper-text">{s.jobs.length} 个已录入岗位</span>
                <Button
                  onClick={() => {
                    setFormOpen(true);
                    if (formPanel.current) {
                      formPanel.current.open = true;
                      formPanel.current.scrollIntoView({ block: 'center' });
                    }
                  }}
                  disabled={s.busy}
                >
                  ＋ 添加岗位
                </Button>
              </div>
            </div>
            {s.jobs.length > 3 && (
              <div className="job-search">
                <label htmlFor="job-search">在已录入岗位中查找</label>
                <input
                  id="job-search"
                  type="search"
                  placeholder="搜索岗位、公司或技能…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>{visibleJobs.length} 个结果</span>
              </div>
            )}
            <div className="job-options" aria-label="选择目标岗位">
              {visibleJobs.map((row) => (
                <button
                  type="button"
                  className="job-option"
                  key={row.id}
                  data-job-id={row.id}
                  aria-pressed={row.id === s.jdId}
                  disabled={s.busy}
                  onClick={() => c.choose('jdId', row.id)}
                >
                  <span className="job-choice-marker">
                    {row.id === s.jdId ? '✓ 已选择' : '选择这个岗位'}
                  </span>
                  <strong>{row.title}</strong>
                  <span className="helper-text">{row.company || '公司暂未提供'}</span>
                  <Chips values={row.skills.slice(0, 5)} />
                  {row.salary && <small>{row.salary}</small>}
                  {row.source_type === 'synthetic' && <small>合成演示岗位</small>}
                </button>
              ))}
            </div>
            {s.jobs.length > 0 && !visibleJobs.length && (
              <p className="compact-empty">没有找到相符的岗位。试试其他关键词，或添加新的目标。</p>
            )}
            {!s.jobs.length && !s.busy && (
              <p className="compact-empty">
                还没有目标岗位。展开“添加岗位”，粘贴你想申请的岗位要求。
              </p>
            )}
          </section>
          <details
            ref={formPanel}
            className="job-form"
            open={formOpen}
            onToggle={(e) => setFormOpen(e.currentTarget.open)}
          >
            <summary>添加岗位</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setOperation('create');
                const previousId = store.getState().jdId;
                await c.create({
                  ...form,
                  company: form.company || null,
                  ...(demo ? { source_type: 'synthetic' as const } : {}),
                });
                if (controller.current === c && store.getState().jdId !== previousId) {
                  setFormOpen(false);
                  setForm({ title: '', company: '', jd_text: '' });
                  setDemo(false);
                }
              }}
            >
              <div className="job-demo-options">
                <span>填入示例岗位：</span>
                {[cpp, go, ml].map((sample) => (
                  <Button
                    key={sample.id}
                    id={`jobs-demo-${sample.id}`}
                    disabled={s.busy}
                    onClick={() => {
                      if (
                        Object.values(form).some((v) => v.trim()) &&
                        !window.confirm('填入示例岗位会替换当前未保存表单，是否继续？')
                      )
                        return;
                      setForm({ title: sample.title, company: '', jd_text: sample.text });
                      setDemo(true);
                    }}
                  >
                    {sample.title}
                  </Button>
                ))}
              </div>
              {(['title', 'company', 'jd_text'] as const).map((key) => (
                <div key={key} className={key === 'jd_text' ? 'full-field' : ''}>
                  <label htmlFor={key === 'jd_text' ? 'jobs-text' : `jobs-${key}`}>
                    {key === 'title'
                      ? '岗位名称'
                      : key === 'company'
                        ? '公司（选填）'
                        : '岗位要求原文'}
                  </label>
                  {key === 'jd_text' ? (
                    <textarea
                      id="jobs-text"
                      rows={6}
                      required
                      maxLength={50000}
                      value={form[key]}
                      readOnly={s.busy}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  ) : (
                    <input
                      id={`jobs-${key}`}
                      maxLength={200}
                      required={key === 'title'}
                      value={form[key]}
                      readOnly={s.busy}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <p className="helper-text full-field">
                合成示例仅填入表单；保存、匹配与优化均需主动发起。
              </p>
              <Button type="submit" tone="primary" disabled={s.busy}>
                {s.busy && operation === 'create' ? '正在整理并保存…' : '保存并选中'}
              </Button>
              {operation === 'create' && s.notice && !s.error && (
                <Button
                  onClick={() => {
                    setFormOpen(false);
                    setForm({ title: '', company: '', jd_text: '' });
                    setDemo(false);
                  }}
                >
                  完成添加，继续匹配
                </Button>
              )}
            </form>
          </details>
          {job && (
            <details className="job-original">
              <summary>查看所选岗位要求</summary>
              <p id="jobs-original">{job.jd_text}</p>
              <p className="helper-text">
                来源：
                {job.source_name ||
                  (job.source_type === 'synthetic' ? '合成演示' : '暂未提供')}{' '}
                {job.source_url && <SafeSource url={job.source_url}>查看来源</SafeSource>}
              </p>
            </details>
          )}
        </>
      )}
      <Feedback id="jobs-status" error={s.error} busy={s.busy}>
        {s.busy
          ? {
              load: '正在读取简历与岗位…',
              create: '正在整理岗位要求并保存…',
              match: '正在对照简历与岗位技能…',
            }[operation]
          : s.notice}
      </Feedback>
      {s.error && operation === 'load' && (
        <Button onClick={() => void c.load()} disabled={s.busy}>
          重试加载
        </Button>
      )}
      {s.jobMock && <p className="status-badge">Mock · 岗位解析使用演示服务，结果仅用于体验</p>}
    </div>
  );
}
