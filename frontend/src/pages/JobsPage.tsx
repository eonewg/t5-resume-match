import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { connectJobs, type JobsController } from '../modules/jobs/controller.ts';
import { useController, useWorkspace } from '../core/WorkspaceContext';
import { Button, Chips, Feedback, PageHeading, SafeSource } from '../components/ui';
import Icon from '../components/Icon';
import cpp from '../demo/fixtures/job-cpp.ts';
import go from '../demo/fixtures/job-go.ts';
import ml from '../demo/fixtures/job-ml.ts';

const emptyForm = {
  title: '',
  company: '',
  jd_text: '',
  location: '',
  salary: '',
  skills: '',
  tools: '',
  education_requirement: '',
  experience_requirement: '',
  responsibilities: '',
  requirements: '',
  preferred_qualifications: '',
};
const fieldLabels = {
  title: '岗位名称',
  company: '公司（选填）',
  location: '工作地点',
  salary: '薪资待遇',
  skills: '技能标签（用顿号或逗号分隔）',
  tools: '工具与框架（用顿号或逗号分隔）',
  education_requirement: '学历要求',
  experience_requirement: '经验要求',
  responsibilities: '岗位职责与目标',
  requirements: '任职要求',
  preferred_qualifications: '加分项',
  jd_text: '岗位原文（保留备查）',
};
const longFields = new Set([
  'responsibilities',
  'requirements',
  'preferred_qualifications',
  'jd_text',
]);

const start = (controller: JobsController) => {
  void controller.load();
};
export default function JobsPage() {
  const { state: s, controller } = useController(connectJobs, start, 'jobs');
  const navigate = useNavigate();
  const { store } = useWorkspace();
  const [formOpen, setFormOpen] = useState(false);
  const readingPane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (readingPane.current) readingPane.current.scrollTop = 0;
  }, [s?.jdId, formOpen]);
  useEffect(() => {
    if (formOpen) document.getElementById('jobs-title')?.focus();
  }, [formOpen]);
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  useEffect(() => setQuery(params.get('q') || ''), [params]);
  const [form, setForm] = useState({ ...emptyForm });
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
    <div className="jobs-page" data-module="jobs">
      <div className="page-title-row">
        <PageHeading title="目标岗位">
          选择你准备申请的岗位，让后续匹配和优化有一个具体目标。
        </PageHeading>
        <Button
          id="jobs-add"
          tone="primary"
          disabled={s.busy || formOpen}
          onClick={() => setFormOpen(true)}
        >
          添加岗位
        </Button>
      </div>
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
      {s.jobMock && (
        <p className="result-provenance">Mock · 岗位解析使用演示服务，结果仅用于体验</p>
      )}
      <>
        <div className="jobs-resume-context panel">
          <span className="material-icon">
            <Icon name="resume" />
          </span>
          <div>
            <span>当前简历</span>
            <strong>{s.resumeId ? resume?.name || '我的简历' : '尚未确认简历'}</strong>
            <p>
              {s.resumeId ? '已确认，可用于岗位分析。' : '支持 PDF、DOCX、TXT 或直接粘贴文本。'}
            </p>
          </div>
          <Link to={s.resumeId ? '/resume/history' : '/resume'}>
            {s.resumeId ? '更换简历' : '导入简历'} <Icon name="arrow" />
          </Link>
        </div>
        <div className="job-browser">
          <section className="job-collection" aria-label="已录入岗位">
            <div className="job-search">
              <label className="sr-only" htmlFor="job-search">
                在已录入岗位中查找
              </label>
              <input
                id="job-search"
                type="search"
                placeholder="搜索岗位、公司或技能"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <p className="collection-tab" aria-live="polite">
                全部 <strong>{visibleJobs.length}</strong>
              </p>
            </div>
            <div className="job-options" role="region" tabIndex={0} aria-label="选择目标岗位">
              {visibleJobs.map((row) => (
                <button
                  type="button"
                  className="job-option"
                  key={row.id}
                  data-job-id={row.id}
                  aria-pressed={!formOpen && row.id === s.jdId}
                  disabled={s.busy}
                  onClick={() => {
                    c.choose('jdId', row.id);
                    setFormOpen(false);
                  }}
                >
                  <span className="job-option-title">
                    <strong>{row.title}</strong>
                    <span aria-hidden="true">{!formOpen && row.id === s.jdId ? '→' : ''}</span>
                  </span>
                  <span>{row.company || '公司暂未提供'}</span>
                  <span className="job-option-skills">
                    {row.skills.length
                      ? row.skills.slice(0, 5).map((skill) => (
                          <span className="keyword" key={skill}>
                            {skill}
                          </span>
                        ))
                      : '技能尚未提供'}
                  </span>
                  {row.source_type === 'synthetic' && <small>合成演示岗位</small>}
                </button>
              ))}
            </div>
            {s.jobs.length > 0 && !visibleJobs.length && (
              <p className="compact-empty">没有相符岗位，试试其他关键词。</p>
            )}
            {!s.jobs.length && !s.busy && (
              <p className="compact-empty">还没有岗位。添加一份准备申请的岗位要求。</p>
            )}
          </section>
          <div
            className="job-reading-pane"
            ref={readingPane}
            role="region"
            tabIndex={0}
            aria-label={formOpen ? '添加岗位表单' : '岗位详情'}
          >
            {job && (
              <article className="job-detail" data-testid="selected-job" hidden={formOpen}>
                <header>
                  <span className="employer-mark" aria-hidden="true">
                    {job.company?.slice(0, 2) || <Icon name="jobs" />}
                  </span>
                  <h2>{job.title}</h2>
                  <p className="job-employer">
                    {job.company || '公司暂未提供'}
                    {job.salary && ` · ${job.salary}`}
                  </p>
                  {job.source_type === 'synthetic' && (
                    <p className="result-provenance">合成演示岗位</p>
                  )}
                </header>
                <section className="job-requirements">
                  <h3>技能要求</h3>
                  <Chips values={job.skills} />
                </section>
                {job.tools.length > 0 && (
                  <section className="job-tools">
                    <h3>工具</h3>
                    <Chips values={job.tools} />
                  </section>
                )}
                {(
                  [
                    'location',
                    'education_requirement',
                    'experience_requirement',
                    'responsibilities',
                    'requirements',
                    'preferred_qualifications',
                  ] as const
                ).map(
                  (key) =>
                    job[key] && (
                      <section className="job-original" key={key}>
                        <h3>{fieldLabels[key]}</h3>
                        <p>{job[key]}</p>
                      </section>
                    ),
                )}
                <section className="job-original">
                  <h3>岗位原文</h3>
                  <p id="jobs-original">{job.original_text || job.jd_text}</p>
                </section>
                <p className="job-source">
                  来源：
                  {job.source_name ||
                    (job.source_type === 'synthetic' ? '合成演示' : '暂未提供')}{' '}
                  {job.source_url && <SafeSource url={job.source_url}>查看来源 ↗</SafeSource>}
                </p>
                <footer className="job-detail-actions">
                  <Button
                    id="jobs-run"
                    tone="primary"
                    disabled={s.busy || !s.resumeId}
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
                  {!s.resumeId && (
                    <Link className="button secondary" to="/resume">
                      先确认简历 <Icon name="arrow" />
                    </Link>
                  )}
                  {job.source_url && <SafeSource url={job.source_url}>查看原始 JD ↗</SafeSource>}
                </footer>
              </article>
            )}
            {!job && !formOpen && (
              <div className="job-reading-prompt">
                <h2>选择一个目标岗位</h2>
                <p>从左侧打开岗位，阅读完整要求后开始匹配。</p>
              </div>
            )}
            <section className="job-form" hidden={!formOpen} aria-labelledby="jobs-form-heading">
              <div className="section-heading">
                <h2 id="jobs-form-heading">添加新岗位</h2>
                <Button id="jobs-cancel-add" disabled={s.busy} onClick={() => setFormOpen(false)}>
                  返回浏览
                </Button>
              </div>
              <label className="full-field">
                从岗位截图识别（PNG / JPEG / WEBP，最大 10 MB）
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  disabled={s.busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (
                      Object.values(form).some((v) => v.trim()) &&
                      !window.confirm('识别结果将替换当前未保存表单，是否继续？')
                    )
                      return;
                    const draft = await c.upload(file);
                    if (controller.current !== c || !draft) return;
                    draft.jd_text = draft.original_text || draft.jd_text;
                    setForm(
                      Object.fromEntries(
                        Object.keys(emptyForm).map((key) => {
                          const value = draft[key as keyof typeof draft];
                          return [key, Array.isArray(value) ? value.join('、') : value || ''];
                        }),
                      ) as typeof emptyForm,
                    );
                    setDemo(false);
                  }}
                />
              </label>
              <p>截图会发送至模型设置中的“截图识别”服务。识别后可编辑，确认保存才会加入岗位库。</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setOperation('create');
                  const previousId = store.getState().jdId;
                  await c.create({
                    ...form,
                    skills: form.skills
                      ? form.skills
                          .split(/[、,，\n]/)
                          .map((v) => v.trim())
                          .filter(Boolean)
                      : undefined,
                    tools: form.tools
                      ? form.tools
                          .split(/[、,，\n]/)
                          .map((v) => v.trim())
                          .filter(Boolean)
                      : undefined,
                    original_text: form.jd_text,
                    salary: form.salary || null,
                    company: form.company || null,
                    ...(demo ? { source_type: 'synthetic' as const } : {}),
                  });
                  if (controller.current === c && store.getState().jdId !== previousId) {
                    setFormOpen(false);
                    setForm({ ...emptyForm });
                    setDemo(false);
                    setQuery('');
                  }
                }}
              >
                {(Object.keys(fieldLabels) as (keyof typeof emptyForm)[]).map((key) => (
                  <div key={key} className={longFields.has(key) ? 'full-field' : ''}>
                    <label htmlFor={key === 'jd_text' ? 'jobs-text' : `jobs-${key}`}>
                      {fieldLabels[key]}
                    </label>
                    {longFields.has(key) ? (
                      <textarea
                        id={key === 'jd_text' ? 'jobs-text' : `jobs-${key}`}
                        rows={6}
                        required={
                          key === 'jd_text' &&
                          !form.responsibilities.trim() &&
                          !form.requirements.trim()
                        }
                        maxLength={key === 'jd_text' ? 50000 : 12000}
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
                <Button type="submit" tone="primary" disabled={s.busy}>
                  {s.busy && operation === 'create' ? '正在整理并保存…' : '保存并选中'}
                </Button>
                <details className="job-demo-options full-field">
                  <summary>使用合成示例</summary>
                  <p>仅填入表单；保存、匹配与优化均需主动发起。</p>
                  <div className="inline-actions">
                    {[cpp, go, ml].map((sample) => (
                      <Button
                        tone="ghost"
                        key={sample.id}
                        id={`jobs-demo-${sample.id}`}
                        disabled={s.busy}
                        onClick={() => {
                          if (
                            Object.values(form).some((v) => v.trim()) &&
                            !window.confirm('填入示例岗位会替换当前未保存表单，是否继续？')
                          )
                            return;
                          setForm({ ...emptyForm, title: sample.title, jd_text: sample.text });
                          setDemo(true);
                        }}
                      >
                        {sample.title}
                      </Button>
                    ))}
                  </div>
                </details>
              </form>
            </section>
          </div>
        </div>
      </>
    </div>
  );
}
