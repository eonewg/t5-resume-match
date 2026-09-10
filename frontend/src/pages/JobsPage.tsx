import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { connectJobs, type JobsController } from '../modules/jobs/controller.ts';
import { useController, useWorkspace } from '../core/WorkspaceContext';
import { Button, Chips, Feedback, SafeSource } from '../components/ui';
import Icon from '../components/Icon';
import LibraryNav from '../components/LibraryNav';
import { jobLabels as fieldLabels, openJobDraft, jobDraftDirty } from '../modules/jobs/draft';

const start = (controller: JobsController) => {
  void controller.load();
};
export default function JobsPage() {
  const { state: s, controller } = useController(connectJobs, start, 'jobs');
  const navigate = useNavigate();
  const { store, jobLibrary, jobDraft } = useWorkspace();
  const readingPane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (readingPane.current) readingPane.current.scrollTop = 0;
  }, [s?.jdId]);
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  useEffect(() => setQuery(params.get('q') || ''), [params]);
  const [operation, setOperation] = useState('load');
  if (!s) return <p role="status">正在读取目标岗位…</p>;
  const c = controller.current!;
  const refreshing = operation === 'load' && s.busy && Boolean(jobLibrary.current);
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
        <LibraryNav kind="jobs">选择你准备申请的岗位，让后续匹配和优化有一个具体目标。</LibraryNav>
        <Button
          id="jobs-add"
          tone="primary"
          disabled={s.busy && !refreshing}
          onClick={() => navigate('/jobs/new')}
        >
          添加岗位
        </Button>
      </div>
      <Feedback id="jobs-status" error={s.error} busy={s.busy}>
        {refreshing
          ? ''
          : s.busy
            ? {
                load: '正在读取简历与岗位…',
                create: '正在整理岗位要求并保存…',
                match: '正在对照简历与岗位技能…',
              }[operation]
            : s.notice}
      </Feedback>
      {s.error && operation === 'load' && (
        <Button onClick={() => void c.load()} disabled={s.busy && !refreshing}>
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
                  aria-pressed={row.id === s.jdId}
                  disabled={s.busy && !refreshing}
                  onClick={() => {
                    c.choose('jdId', row.id);
                  }}
                >
                  <span className="job-option-title">
                    <strong>{row.title}</strong>
                    <span aria-hidden="true">{row.id === s.jdId ? '→' : ''}</span>
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
            {!s.jobs.length && (!s.busy || refreshing) && (
              <p className="compact-empty">还没有岗位。添加一份准备申请的岗位要求。</p>
            )}
          </section>
          <div
            className="job-reading-pane"
            ref={readingPane}
            role="region"
            tabIndex={0}
            aria-label="岗位详情"
          >
            {job && (
              <article className="job-detail" data-testid="selected-job">
                <header>
                  <span className="employer-mark" aria-hidden="true">
                    {job.company?.slice(0, 2) || <Icon name="jobs" />}
                  </span>
                  <div className="detail-title-row">
                    <h2>{job.title}</h2>
                    <Button
                      tone="secondary"
                      disabled={s.busy && !refreshing}
                      onClick={() => {
                        if (
                          jobDraft.current &&
                          jobDraftDirty(jobDraft.current) &&
                          !window.confirm('编辑这份岗位会替换当前未保存的岗位草稿，是否继续？')
                        )
                          return;
                        jobDraft.current = openJobDraft(job);
                        navigate('/jobs/new');
                      }}
                    >
                      编辑岗位
                    </Button>
                  </div>
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
                  {job.source_url && <SafeSource url={job.source_url}>打开岗位链接 ↗</SafeSource>}
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
            {!job && (
              <div className="job-reading-prompt">
                <h2>选择一个目标岗位</h2>
                <p>从左侧打开岗位，阅读完整要求后开始匹配。</p>
              </div>
            )}
          </div>
        </div>
      </>
    </div>
  );
}
