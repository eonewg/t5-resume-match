import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductShell } from '../src/App';
import { WorkspaceProvider } from '../src/core/WorkspaceContext';
import { createWorkspace } from '../src/core/state';
import type { JD, Resume } from '../src/core/contracts';
import demoResume from '../src/demo/fixtures/resume-zh.ts';
import cpp from '../src/demo/fixtures/job-cpp.ts';
import go from '../src/demo/fixtures/job-go.ts';
import ml from '../src/demo/fixtures/job-ml.ts';

const resume: Resume = {
  id: 'r',
  name: '测试同学',
  raw_text: '  原文\r\nPython  ',
  education: '本科',
  skills: ['Python'],
  experience: ['处理课程记录'],
};
const job: JD = {
  id: 'j',
  title: '后端工程师',
  company: '合成公司',
  jd_text: 'Python SQL',
  skills: ['Python', 'SQL'],
  tools: [],
  salary: null,
  salary_min: null,
  salary_max: null,
  currency: null,
  salary_period: null,
  source_type: 'synthetic',
  source_url: null,
  source_name: null,
  collected_at: null,
};
const modules = Object.fromEntries(
  ['resume', 'jobs', 'diagnosis', 'analytics'].map((key) => [key, { is_mock: false }]),
);

it('previews a job screenshot, allows corrections and saves only after confirmation', async () => {
  handler = (path, options) => {
    if (path === '/api/v1/jobs/upload-preview')
      return json({
        ...job,
        original_text: '截图原文',
        requirements: 'Python',
        responsibilities: '开发接口',
      });
    if (path === '/api/v1/jobs' && options.method === 'POST')
      return json({ ...job, ...JSON.parse(String(options.body)), id: 'new-job' });
  };
  page('/jobs');
  fireEvent.click(await screen.findByRole('button', { name: '添加岗位', exact: true }));
  const picker = screen.getByLabelText('选择岗位截图');
  fireEvent.change(picker, {
    target: { files: [new File(['synthetic-image'], 'job.png', { type: 'image/png' })] },
  });
  expect(await screen.findByAltText('岗位截图预览')).toBeTruthy();
  expect(requests.filter((x) => x.path === '/api/v1/jobs/upload-preview')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '识别截图' }));
  await waitFor(() =>
    expect((screen.getByLabelText('任职要求') as HTMLTextAreaElement).value).toBe('Python'),
  );
  expect(
    requests.filter((x) => x.path === '/api/v1/jobs' && x.options.method === 'POST'),
  ).toHaveLength(0);
  expect((screen.getByLabelText('岗位原文（保留备查）') as HTMLTextAreaElement).value).toBe(
    '截图原文',
  );
  fireEvent.change(screen.getByLabelText('任职要求'), { target: { value: 'SQL' } });
  fireEvent.click(screen.getByRole('button', { name: '保存并选中' }));
  await waitFor(() =>
    expect(
      requests.find((x) => x.path === '/api/v1/jobs' && x.options.method === 'POST'),
    ).toBeDefined(),
  );
  expect(
    JSON.parse(
      String(
        requests.find((x) => x.path === '/api/v1/jobs' && x.options.method === 'POST')!.options
          .body,
      ),
    ),
  ).toMatchObject({ requirements: 'SQL', original_text: '截图原文' });
});
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers });

it('keeps resume screenshots local until recognition and separates document upload', async () => {
  handler = (path) => (path === '/api/v1/resumes/upload-preview' ? json(resume) : undefined);
  page('/resume');
  const picker = await screen.findByLabelText('选择简历截图');
  expect((document.getElementById('resume-file') as HTMLInputElement).accept).toBe(
    '.pdf,.docx,.txt',
  );
  const first = new File(['first'], 'first.png', { type: 'image/png' });
  fireEvent.change(picker, { target: { files: [first] } });
  expect(await screen.findByAltText('简历截图预览')).toBeTruthy();
  expect(requests.filter((x) => x.path.endsWith('/upload-preview'))).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '移除' }));
  expect(screen.queryByAltText('简历截图预览')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  const second = new File(['second'], 'second.png', { type: 'image/png' });
  fireEvent.change(picker, { target: { files: [second] } });
  fireEvent.click(screen.getByRole('button', { name: '识别截图' }));
  await waitFor(() =>
    expect(requests.filter((x) => x.path.endsWith('/upload-preview'))).toHaveLength(1),
  );
  const body = requests.find((x) => x.path.endsWith('/upload-preview'))!.options.body as FormData;
  expect((body.get('file') as File).name).toBe('second.png');
});
let requests: { path: string; options: RequestInit }[];
let handler: (path: string, options: RequestInit) => Response | Promise<Response> | undefined;
beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  requests = [];
  handler = () => undefined;
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, options: RequestInit = {}) => {
      requests.push({ path, options });
      const custom = handler(path, options);
      if (custom) return custom;
      if (path.endsWith('/modules')) return json(modules);
      if (path.startsWith('/api/v1/resumes?')) return json([resume]);
      if (path.startsWith('/api/v1/jobs?')) return json([job]);
      if (path === '/api/v1/resumes/r') return json(resume);
      if (path === '/api/v1/jobs/j') return json(job);
      if (path.startsWith('/api/v1/analytics'))
        return json({ summary: '样本摘要', skills: { Python: 1 }, market: null, is_mock: true });
      throw Error('Unexpected request: ' + path);
    }),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function page(path: string, selected = false) {
  const store = createWorkspace();
  if (selected) store.updateSelection({ resumeId: 'r', jdId: 'j' });
  render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceProvider workspace={store}>
        <ProductShell />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
  return store;
}
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const settleResume = () => waitFor(() => expect(input('resume-dropzone').disabled).toBe(false));
describe('React routes and task workspace', () => {
  it('searches within the job list and permits browsing before resume confirmation', async () => {
    const store = page('/');
    expect(
      Array.from(document.querySelectorAll('.insight-links a')).map((link) => [
        link.querySelector('strong')?.textContent,
        link.getAttribute('href'),
      ]),
    ).toEqual([
      ['技能需求', '/analytics?tab=skills'],
      ['薪资分析', '/analytics?tab=salary'],
      ['岗位与来源', '/analytics?tab=jobs'],
    ]);
    expect(screen.getByRole('link', { name: '浏览岗位样本' }).getAttribute('href')).toBe(
      '/analytics?tab=jobs',
    );
    expect(screen.queryByRole('searchbox', { name: '搜索已录入岗位' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '目标岗位', exact: true }));
    await screen.findByRole('heading', { name: '目标岗位', level: 1 });
    const search = input('job-search');
    fireEvent.change(search, { target: { value: 'Python' } });
    await waitFor(() => expect(document.querySelector('[data-job-id="j"]')).not.toBeNull());
    expect(input('job-search').value).toBe('Python');
    fireEvent.click(document.querySelector('[data-job-id="j"]')!);
    expect((input('jobs-run') as unknown as HTMLButtonElement).disabled).toBe(true);
    expect(store.getState()).toMatchObject({ resumeId: null, jdId: 'j', result: null });
    fireEvent.change(search, { target: { value: '不存在的技能' } });
    await waitFor(() => expect(document.querySelector('[data-job-id="j"]')).toBeNull());
    expect(document.getElementById('jobs-original')?.textContent).toBe(job.jd_text);
    expect(requests.some((request) => request.options.method === 'POST')).toBe(false);
  });
  it('home explains the flow and changes its CTA when confirmed selection changes', async () => {
    const store = page('/');
    expect(document.getElementById('home-next')?.textContent).toContain('导入简历');
    act(() => store.updateSelection({ resumeId: 'r' }));
    expect(document.getElementById('home-next')?.textContent).toContain('选择目标岗位');
    act(() => store.updateSelection({ jdId: 'j' }));
    expect(document.getElementById('home-next')?.textContent).toContain('匹配分析');
    await screen.findByText('后端工程师');
  });
  it.each([
    ['/resume', '我的简历'],
    ['/jobs', '目标岗位'],
    ['/matching', '匹配分析'],
    ['/diagnosis', 'AI 优化'],
    ['/analytics', '市场洞察'],
  ])('normal route %s renders its React page', async (path, title) => {
    page(path);
    await screen.findByRole('heading', { name: title, level: 1 });
    expect(document.querySelectorAll('nav [aria-current="page"]').length).toBe(1);
  });
  it('empty matching and diagnosis send no mutation request', async () => {
    page('/matching');
    await screen.findByRole('heading', { name: '还没有匹配结果' });
    fireEvent.click(document.querySelector('[data-view="diagnosis"]')!);
    await screen.findByRole('heading', { name: '先选择简历和目标岗位' });
    expect(requests.some((r) => r.options.method === 'POST')).toBe(false);
  });
});
describe('migrated demo interactions', () => {
  it('upload opens the file picker and pasted text waits for explicit recognition', async () => {
    handler = (path, options) =>
      path.endsWith('/preview')
        ? json({ ...resume, raw_text: JSON.parse(options.body as string).raw_text })
        : undefined;
    page('/resume');
    await settleResume();
    const picker = vi.spyOn(input('resume-file'), 'click');
    fireEvent.click(screen.getByRole('button', { name: '上传文档', exact: true }));
    expect(picker).toHaveBeenCalledOnce();
    fireEvent.change(input('resume-raw'), { target: { value: '待识别的简历原文' } });
    expect(input('resume-raw').value).toBe('待识别的简历原文');
    expect(requests.some((request) => request.options.method === 'POST')).toBe(false);
    fireEvent.click(input('resume-parse'));
    await waitFor(() => expect(input('resume-name').value).toBe(resume.name));
    const mutations = requests.filter((request) => request.options.method === 'POST');
    expect(mutations).toHaveLength(1);
    expect(mutations[0].path).toBe('/api/v1/resumes/preview');
  });
  it('resume fill only changes source; repeated clicks and cancellation never submit', async () => {
    page('/resume');
    await settleResume();
    const count = requests.length;
    fireEvent.click(screen.getByText('更多选项', { exact: true }));
    expect((document.querySelector('.resume-secondary-tools') as HTMLDetailsElement).open).toBe(
      true,
    );
    fireEvent.change(input('resume-raw'), { target: { value: '用户原文' } });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(input('resume-demo-fill'));
    expect(input('resume-raw').value).toBe('用户原文');
    fireEvent.click(input('resume-demo-fill'));
    expect(input('resume-raw').value).toBe(demoResume.replace(/\r\n?/g, '\n'));
    expect(input('resume-demo-fill').textContent).toBe('✓ 已填入示例');
    expect(input('resume-name').value).toBe('');
    expect(input('resume-reviewed').checked).toBe(false);
    fireEvent.click(input('resume-demo-fill'));
    expect(requests.length).toBe(count);
  });
  it('all three job fixtures only fill inputs and preserve synthetic provenance on explicit save', async () => {
    page('/jobs', true);
    await screen.findByText('测试同学');
    const count = requests.length;
    for (const sample of [cpp, go, ml]) {
      fireEvent.click(input('jobs-demo-' + sample.id));
      expect(input('jobs-title').value).toBe(sample.title);
      expect(input('jobs-text').value).toBe(sample.text.replace(/\r\n?/g, '\n'));
      expect(input('jobs-company').value).toBe('');
    }
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(input('jobs-demo-cpp'));
    expect(input('jobs-title').value).toBe(ml.title);
    expect(requests.length).toBe(count);
    handler = (path, options) =>
      path === '/api/v1/jobs'
        ? json({ ...job, ...JSON.parse(options.body as string), id: 'new-job' })
        : undefined;
    fireEvent.submit(input('jobs-title').closest('form')!);
    await waitFor(() => expect(requests.some((r) => r.options.method === 'POST')).toBe(true));
    const sent = requests.find((r) => r.options.method === 'POST')!;
    expect(JSON.parse(sent.options.body as string).source_type).toBe('synthetic');
  });
});
describe('React lifecycle and protected fields', () => {
  it('retains edits across navigation, protects intentional blanks and only retries GET after save', async () => {
    let saved: Resume | null = null;
    let failRead = true;
    handler = (path, options) => {
      if (path.endsWith('/preview'))
        return json({ ...resume, raw_text: JSON.parse(options.body as string).raw_text });
      if (path === '/api/v1/resumes' && options.method === 'POST') {
        saved = { ...JSON.parse(options.body as string), id: 'new' };
        return json(saved, 201);
      }
      if (path === '/api/v1/resumes/new')
        return failRead ? json({ error: { message: '读取失败' } }, 503) : json(saved);
    };
    const store = page('/resume');
    await settleResume();
    fireEvent.change(input('resume-raw'), { target: { value: '原文 Python' } });
    fireEvent.click(input('resume-parse'));
    await waitFor(() => expect(input('resume-education').value).toBe('本科'));
    fireEvent.change(input('resume-education'), { target: { value: '' } });
    fireEvent.change(input('resume-skills'), { target: { value: 'SQL' } });
    fireEvent.click(document.querySelector('[data-view=home]')!);
    await screen.findByRole('heading', { name: '准备好开启下一次机会了吗？' });
    fireEvent.click(document.querySelector('[data-view=resume]')!);
    await settleResume();
    expect(input('resume-skills').value).toBe('SQL');
    fireEvent.click(input('resume-parse'));
    await waitFor(() => expect(input('resume-parse').disabled).toBe(false));
    expect(input('resume-education').value).toBe('');
    fireEvent.click(input('resume-reviewed'));
    fireEvent.click(input('resume-save'));
    await screen.findByText(/保存已成功，但重新读取未完成/);
    expect(store.getState().resumeId).toBe(null);
    failRead = false;
    fireEvent.click(input('resume-save'));
    await waitFor(() => expect(store.getState().resumeId).toBe('new'));
    expect(
      requests.filter((r) => r.path === '/api/v1/resumes' && r.options.method === 'POST').length,
    ).toBe(1);
    expect(saved?.education).toBe('');
    expect(saved?.skills).toEqual(['SQL']);
  });
  it('navigation aborts pending requests and suppresses late AI completion', async () => {
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    handler = (path, options) =>
      path.endsWith('/preview')
        ? new Promise((r) => {
            resolve = r;
            signal = options.signal;
          })
        : undefined;
    const store = page('/resume');
    await settleResume();
    fireEvent.change(input('resume-raw'), { target: { value: '保留原文' } });
    fireEvent.click(input('resume-parse'));
    fireEvent.click(document.querySelector('[data-view=home]')!);
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(json({ ...resume, raw_text: '保留原文' })));
    expect(store.getState().resumeId).toBe(null);
    fireEvent.click(document.querySelector('[data-view=resume]')!);
    await settleResume();
    expect(input('resume-raw').value).toBe('保留原文');
    expect(input('resume-name').value).toBe('');
  });
  it('upload extraction errors preserve full source and offer manual recovery without an AI request', async () => {
    handler = (path) =>
      path.endsWith('/upload-preview')
        ? json({ error: { message: { message: 'AI 超时', raw_text: resume.raw_text } } }, 504)
        : undefined;
    page('/resume');
    await settleResume();
    fireEvent.change(input('resume-file'), {
      target: { files: [new File(['text'], 'resume.txt')] },
    });
    await screen.findByText(/AI 暂时无法识别/);
    expect(input('resume-raw').value).toBe(resume.raw_text.replace(/\r\n?/g, '\n'));
    fireEvent.click(input('resume-manual'));
    expect(document.querySelector('.resume-fields')?.hasAttribute('hidden')).toBe(false);
    expect(requests.filter((r) => r.options.method === 'POST').length).toBe(1);
  });
});
describe('matching and diagnosis rendering', () => {
  it('separates keyword and AI scores, preserves keywords on failure and expands quoted evidence', async () => {
    const match = {
      id: 'm',
      resume_id: 'r',
      jd_id: 'j',
      score: 55,
      keyword_score: 50,
      matched_skills: ['Python'],
      missing_skills: ['SQL'],
      gap_analysis: ['关键词 1/2'],
      is_mock: false,
    };
    let fail = true;
    handler = (path) => {
      if (path === '/api/v1/matches') return json(match, 201);
      if (path.endsWith('/assessment'))
        return fail
          ? json({ error: { message: '上游内容过滤，未生成综合评估' } }, 502)
          : json({
              ...match,
              ai_assessment: {
                score: 75,
                summary: '项目提供了相关证据',
                model: 'fixture',
                dimensions: ['skills', 'experience', 'education'].map((dimension) => ({
                  dimension,
                  score: 75,
                  applicable: true,
                  reason: '按原文核对',
                  jd_quotes: ['Python SQL'],
                  resume_quotes: ['处理课程记录'],
                })),
              },
            });
    };
    const store = page('/matching', true);
    await screen.findByRole('button', { name: '开始匹配' });
    fireEvent.click(input('jobs-run'));
    await screen.findByRole('button', { name: '开始综合评估' });
    expect(input('match-score').textContent).toBe('50%');
    expect(requests.filter((r) => r.path.endsWith('/assessment'))).toHaveLength(0);
    fireEvent.click(input('match-assess'));
    await screen.findByText('上游内容过滤，未生成综合评估');
    expect(input('match-score').textContent).toBe('50%');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '重试综合评估' }));
    await screen.findByText('项目提供了相关证据');
    expect(store.getState().result?.match?.ai_assessment?.score).toBe(75);
    expect(input('match-score').textContent).toBe('50%');
    const details = document.querySelector('.match-ai-dimensions details') as HTMLDetailsElement;
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
    expect(within(details).getByText('处理课程记录')).toBeTruthy();
  });
  it('searches the job collection without changing selection and matches only the chosen job', async () => {
    const second = {
      ...job,
      id: 'j2',
      title: '数据工程师',
      company: '第二家公司',
      jd_text: '完整岗位要求 SQL',
      tools: ['dbt'],
      skills: ['SQL'],
    };
    handler = (path, options) => {
      if (path.startsWith('/api/v1/jobs?')) return json([job, second]);
      if (path === '/api/v1/matches') {
        const pair = JSON.parse(options.body as string);
        return json(
          {
            ...pair,
            id: 'm2',
            score: 60,
            is_mock: false,
            matched_skills: [],
            missing_skills: ['SQL'],
            gap_analysis: ['原文中的技能证据'],
          },
          201,
        );
      }
    };
    const store = page('/jobs', true);
    await screen.findByText('测试同学');
    fireEvent.change(input('job-search'), { target: { value: '第二家公司' } });
    expect(document.querySelector('[data-job-id="j"]')).toBeNull();
    expect(store.getState().jdId).toBe('j');
    fireEvent.click(document.querySelector('[data-job-id="j2"]')!);
    expect(store.getState().jdId).toBe('j2');
    expect(document.getElementById('jobs-original')?.textContent).toBe(second.jd_text);
    expect(screen.getByTestId('selected-job').textContent).toContain('dbt');
    fireEvent.change(input('job-search'), { target: { value: '没有结果' } });
    expect(store.getState().jdId).toBe('j2');
    expect(requests.some((request) => request.options.method === 'POST')).toBe(false);
    fireEvent.click(input('jobs-run'));
    await screen.findByRole('heading', { name: '匹配分析', level: 1 });
    const sent = requests.find((request) => request.options.method === 'POST')!;
    expect(JSON.parse(sent.options.body as string)).toEqual({ resume_id: 'r', jd_id: 'j2' });
    expect(store.getState().result?.match?.jd_id).toBe('j2');
  });

  it('keeps the job form after a save error and recovers on an explicit retry', async () => {
    let fail = true;
    handler = (path, options) =>
      path === '/api/v1/jobs' && options.method === 'POST'
        ? fail
          ? json({ error: { message: '岗位保存失败' } }, 503)
          : json({ ...job, ...JSON.parse(options.body as string), id: 'saved-job' }, 201)
        : undefined;
    const store = page('/jobs', true);
    await screen.findByText('测试同学');
    const formPanel = document.querySelector('.job-form') as HTMLElement;
    fireEvent.change(input('job-search'), { target: { value: '后端' } });
    fireEvent.click(screen.getByRole('button', { name: '添加岗位', exact: true }));
    expect(formPanel.hidden).toBe(false);
    expect(document.activeElement).toBe(input('jobs-title'));
    fireEvent.change(input('jobs-title'), { target: { value: '我的目标岗位' } });
    fireEvent.change(input('jobs-text'), { target: { value: '用户提供的岗位原文' } });
    fireEvent.submit(input('jobs-title').closest('form')!);
    await screen.findByText('岗位保存失败');
    expect(input('jobs-title').value).toBe('我的目标岗位');
    expect(input('jobs-text').value).toBe('用户提供的岗位原文');
    expect(store.getState().jdId).toBe('j');
    expect(formPanel.hidden).toBe(false);
    expect(document.querySelector('.job-option[aria-pressed="true"]')).toBeNull();
    fail = false;
    fireEvent.submit(input('jobs-title').closest('form')!);
    await waitFor(() => expect(store.getState().jdId).toBe('saved-job'));
    expect(formPanel.hidden).toBe(true);
    expect(input('job-search').value).toBe('');
    expect(
      document.querySelector('.job-option[aria-pressed="true"]')?.getAttribute('data-job-id'),
    ).toBe('saved-job');
    expect(store.getState().result).toBeNull();
    expect(requests.filter((request) => request.path === '/api/v1/matches')).toHaveLength(0);
  });

  it('adding a job leaves the old detail inactive and returning restores browsing with the draft retained', async () => {
    const store = page('/jobs', true);
    await screen.findByText('测试同学');
    const selected = document.querySelector('[data-job-id="j"]')!;
    const detail = screen.getByTestId('selected-job');
    const formPanel = document.querySelector('.job-form') as HTMLElement;
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(formPanel.hidden).toBe(true);
    expect(screen.getAllByRole('button', { name: '添加岗位', exact: true })).toHaveLength(1);
    fireEvent.click(input('jobs-add'));
    expect(selected.getAttribute('aria-pressed')).toBe('false');
    expect(detail.hidden).toBe(true);
    expect(formPanel.hidden).toBe(false);
    fireEvent.change(input('jobs-title'), { target: { value: '未保存的岗位' } });
    fireEvent.click(input('jobs-cancel-add'));
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(detail.hidden).toBe(false);
    expect(formPanel.hidden).toBe(true);
    fireEvent.click(input('jobs-add'));
    expect(input('jobs-title').value).toBe('未保存的岗位');
    fireEvent.click(selected);
    expect(formPanel.hidden).toBe(true);
    expect(detail.hidden).toBe(false);
    expect(store.getState().jdId).toBe('j');
    expect(requests.some((request) => request.options.method === 'POST')).toBe(false);
  });

  it('shows Mock without a numeric score, safely renders untrusted text and never overwrites resume', async () => {
    const store = page('/matching', true);
    handler = (path) =>
      path === '/api/v1/matches'
        ? json(
            {
              id: 'm',
              resume_id: 'r',
              jd_id: 'j',
              score: 50,
              is_mock: true,
              matched_skills: ['Python'],
              missing_skills: ['SQL'],
              gap_analysis: ['<img src=x onerror=alert(1)>'],
            },
            201,
          )
        : undefined;
    await screen.findByRole('button', { name: '开始匹配' });
    fireEvent.click(input('jobs-run'));
    await screen.findByText('Mock · 演示数据，不展示真实分数');
    expect(input('match-score').textContent).toBe('—');
    expect(document.querySelector('#jobs-result img')).toBe(null);
    handler = (path) =>
      path === '/api/v1/diagnoses'
        ? json(
            {
              id: 'd',
              resume_id: 'r',
              jd_id: 'j',
              is_mock: true,
              summary: '演示摘要',
              suggestions: [
                '【STAR】原文：处理课程记录\n优化：处理课程记录【待补充：实际数量】\n理由：保留事实',
                '<script>unsafe</script>',
              ],
            },
            201,
          )
        : undefined;
    fireEvent.click(input('matching-optimize'));
    await screen.findByText('建议表达');
    expect(screen.getByTestId('diagnosis-result-mode').textContent).toContain('演示数据');
    expect(document.querySelector('mark')?.textContent).toBe('【待补充：实际数量】');
    expect(document.querySelector('[data-testid=diagnosis-result] script')).toBe(null);
    expect(store.getState().resumeId).toBe('r');
    expect(
      requests.filter((r) => r.path === '/api/v1/resumes' && r.options.method === 'POST').length,
    ).toBe(0);
    expect(document.querySelector('.suggestion-compare section:first-child p')?.textContent).toBe(
      '处理课程记录',
    );
  });
});

describe('desktop workspace operations', () => {
  it('quick switches both pages in resume/job order and restores successful pairs without another POST', async () => {
    handler = (path, options) => {
      if (path.startsWith('/api/v1/resumes?'))
        return json([resume, { ...resume, id: 'r2', name: '另一版本' }]);
      if (path.startsWith('/api/v1/jobs?'))
        return json([job, { ...job, id: 'j2', title: '另一岗位' }]);
      if (path === '/api/v1/resumes/r2') return json({ ...resume, id: 'r2', name: '另一版本' });
      if (path === '/api/v1/jobs/j2') return json({ ...job, id: 'j2', title: '另一岗位' });
      if (path === '/api/v1/matches')
        return json({
          id: 'm',
          ...JSON.parse(options.body as string),
          score: 50,
          matched_skills: ['Python'],
          missing_skills: ['SQL'],
          gap_analysis: [],
          is_mock: false,
        });
      if (path === '/api/v1/diagnoses')
        return json({
          id: 'd',
          ...JSON.parse(options.body as string),
          summary: '缓存中的优化建议',
          suggestions: [],
          is_mock: false,
        });
    };
    const store = page('/matching', true);
    await waitFor(() => expect(input('quick-resume').disabled).toBe(false));
    expect(
      [...document.querySelectorAll('.pair-selector label')].map((el) => el.textContent),
    ).toEqual(['当前简历', '目标岗位']);
    await waitFor(() => expect(input('jobs-run').disabled).toBe(false));
    fireEvent.click(input('jobs-run'));
    await screen.findByText('已命中 1 项岗位关键词，还有 1 项未直接命中。');
    fireEvent.change(input('quick-job'), { target: { value: 'j2' } });
    expect(document.querySelector('#match-score')).toBeNull();
    fireEvent.change(input('quick-job'), { target: { value: 'j' } });
    await waitFor(() => expect(input('match-score').textContent).toBe('50%'));
    expect(requests.filter((r) => r.path === '/api/v1/matches')).toHaveLength(1);
    fireEvent.click(document.querySelector('[data-view="diagnosis"]')!);
    await waitFor(() => expect(input('quick-resume').disabled).toBe(false));
    expect(
      [...document.querySelectorAll('.pair-selector label')].map((el) => el.textContent),
    ).toEqual(['当前简历', '目标岗位']);
    fireEvent.click(input('diagnosis-run'));
    await screen.findByText('缓存中的优化建议');
    fireEvent.change(input('quick-resume'), { target: { value: 'r2' } });
    expect(screen.queryByText('缓存中的优化建议')).toBeNull();
    expect(store.getState().resumeId).toBe('r2');
    fireEvent.change(input('quick-resume'), { target: { value: 'r' } });
    await screen.findByText('缓存中的优化建议');
    expect(requests.filter((r) => r.path === '/api/v1/diagnoses')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '返回简历编辑 →' }).getAttribute('href')).toBe(
      '/resume',
    );
    expect(screen.getByRole('link', { name: '返回岗位管理 →' }).getAttribute('href')).toBe('/jobs');
  });
  it.each([
    ['【风险提醒】确认项目中由你负责的接口', '确认项目中由你负责的接口'],
    ['【关键词·待核实】Python', 'Python'],
  ])(
    'renders a supplement-only response without an empty reader: %s',
    async (suggestion, content) => {
      handler = (path) =>
        path === '/api/v1/diagnoses'
          ? json(
              {
                id: 'only-extra',
                resume_id: 'r',
                jd_id: 'j',
                is_mock: true,
                summary: '合成边界样本',
                suggestions: [suggestion],
              },
              201,
            )
          : undefined;
      page('/diagnosis', true);
      await screen.findByRole('button', { name: '生成优化建议' });
      fireEvent.click(input('diagnosis-run'));
      await screen.findByText('合成边界样本');
      expect(document.querySelector('.suggestion-reader')).toBeNull();
      const extra = document.querySelector('.suggestion-extra')! as HTMLDetailsElement;
      expect(extra.open).toBe(false);
      fireEvent.click(extra.querySelector('summary')!);
      expect(extra.textContent).toContain(content);
      expect(requests.filter((request) => request.options.method === 'POST')).toHaveLength(1);
    },
  );
  it('cancelled clearing preserves edits; explicit clear leaves history untouched and makes no request', async () => {
    page('/resume');
    await settleResume();
    fireEvent.change(input('resume-raw'), { target: { value: '保留原文' } });
    fireEvent.change(input('resume-name'), { target: { value: '用户姓名' } });
    const count = requests.length;
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(input('resume-clear-fields'));
    expect(input('resume-name').value).toBe('用户姓名');
    fireEvent.click(input('resume-clear-fields'));
    expect(input('resume-name').value).toBe('');
    expect(input('resume-raw').value).toBe('保留原文');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(input('resume-clear-draft'));
    expect(input('resume-raw').value).toBe('保留原文');
    fireEvent.click(input('resume-clear-draft'));
    expect(input('resume-raw').value).toBe('');
    expect(document.querySelector('[data-resume-id="r"]')).not.toBe(null);
    expect(requests.length).toBe(count);
  });
  it('continue waits for verified readback and retries only the read after a save failure', async () => {
    let saved: Resume | null = null;
    let fail = true;
    handler = (path, options) => {
      if (path === '/api/v1/resumes' && options.method === 'POST') {
        saved = { ...JSON.parse(options.body as string), id: 'next' };
        return json(saved, 201);
      }
      if (path === '/api/v1/resumes/next')
        return fail ? json({ error: { message: '暂时不可用' } }, 503) : json(saved);
    };
    page('/resume');
    await settleResume();
    fireEvent.change(input('resume-raw'), { target: { value: '确认的原文' } });
    fireEvent.click(input('resume-reviewed'));
    fireEvent.click(input('resume-save-next'));
    await screen.findByText(/保存已成功，但重新读取未完成/);
    expect(document.querySelector('[data-module="resume"]')).not.toBe(null);
    fail = false;
    fireEvent.click(input('resume-save-next'));
    await screen.findByRole('heading', { name: '目标岗位', exact: true });
    expect(
      requests.filter((r) => r.path === '/api/v1/resumes' && r.options.method === 'POST'),
    ).toHaveLength(1);
  });
  it('lets users read every suggestion and its full evidence without duplicating or applying content', async () => {
    const suggestions = [
      ...Array.from({ length: 6 }, (_, i) => `【岗位建议】补充技能应用 ${i}。完整依据 ${i}。`),
      ...Array.from(
        { length: 7 },
        (_, i) => `【STAR】原文：原文 ${i}\n优化：建议 ${i}\n理由：明确项目结果 ${i}`,
      ),
      '不要虚构经历',
      '【关键词·待核实】Redis',
      '【关键词·待核实】Redis',
      '【风险提醒】核实项目中的数字',
    ];
    handler = (path) =>
      path === '/api/v1/diagnoses'
        ? json(
            {
              id: 'd',
              resume_id: 'r',
              jd_id: 'j',
              is_mock: false,
              summary: '先补充项目证据。然后调整表达。',
              suggestions,
            },
            201,
          )
        : undefined;
    // A repeated provider string appears once in the reading index.
    suggestions.push(suggestions[6]);
    const store = page('/diagnosis', true);
    await screen.findByRole('button', { name: '生成优化建议' });
    fireEvent.click(input('diagnosis-run'));
    await screen.findByRole('heading', { name: /经历表达/ });
    const index = screen.getByRole('complementary', { name: '经历表达建议列表' });
    expect(within(index).getAllByRole('button')).toHaveLength(7);
    fireEvent.click(within(index).getAllByRole('button')[6]);
    const reader = screen.getByRole('region', { name: '当前建议' });
    expect(reader.textContent).toContain('原文 6');
    expect(reader.textContent).toContain('建议 6');
    expect(reader.textContent).toContain('明确项目结果 6');
    fireEvent.click(screen.getByRole('button', { name: /岗位重点/ }));
    const jobs = screen.getByRole('region', { name: '岗位重点' });
    expect(jobs.querySelectorAll('ol > li')).toHaveLength(6);
    expect(jobs.textContent).toContain('完整依据 1');
    expect(jobs.textContent).toContain('完整依据 5');
    expect(screen.queryByRole('complementary', { name: '岗位重点建议列表' })).toBeNull();
    expect(screen.queryByRole('button', { name: /补充与核实/ })).toBeNull();
    const keywordDetails = jobs.querySelector('.suggestion-keywords')! as HTMLDetailsElement;
    expect(keywordDetails.open).toBe(false);
    fireEvent.click(within(jobs).getByText(/岗位相关技能 ·/));
    expect(jobs.textContent).toContain('用过的技能可以补一个实际案例');
    expect(within(jobs).getAllByText('Redis')).toHaveLength(1);
    const verify = document.querySelector('.suggestion-reminders')! as HTMLDetailsElement;
    expect(verify.open).toBe(false);
    fireEvent.click(screen.getByText(/修改前的补充提示 ·/));
    expect(verify.textContent).toContain('不要虚构经历');
    expect(verify.textContent).toContain('核实项目中的数字');
    expect(within(verify).queryByRole('button')).toBeNull();
    expect(document.getElementById('diagnosis-summary')?.textContent).toContain('然后调整表达');
    expect(store.getState().resumeId).toBe('r');
    expect(requests.filter((request) => request.options.method === 'POST')).toHaveLength(1);
  });
});

it('home recognizes direct diagnosis while keeping unrun matching incomplete', async () => {
  const store = createWorkspace();
  store.updateSelection({
    resumeId: 'r',
    jdId: 'j',
    result: {
      diagnosis: {
        id: 'd',
        resume_id: 'r',
        jd_id: 'j',
        is_mock: false,
        summary: '完成',
        suggestions: [],
      },
    },
  });
  render(
    <MemoryRouter initialEntries={['/']}>
      <WorkspaceProvider workspace={store}>
        <ProductShell />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
  await screen.findByText('已生成建议');
  const items = document.querySelectorAll('.workflow-steps > li');
  expect(items[2].getAttribute('data-state')).toBe('pending');
  expect(items[3].getAttribute('data-state')).toBe('complete');
  expect(document.getElementById('home-next')?.getAttribute('href')).toBe('/diagnosis');
  expect(requests.filter((r) => r.options.method === 'POST')).toHaveLength(0);
});
