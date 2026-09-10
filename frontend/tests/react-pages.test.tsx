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
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers });
let requests: { path: string; options: RequestInit }[];
let handler: (path: string, options: RequestInit) => Response | Promise<Response> | undefined;
beforeEach(() => {
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
  it('carries global search into the job list and permits browsing before resume confirmation', async () => {
    const store = page('/');
    const search = screen.getByRole('searchbox', { name: '搜索已录入岗位' });
    fireEvent.change(search, { target: { value: 'Python' } });
    fireEvent.submit(search.closest('form')!);
    await screen.findByRole('heading', { name: '目标岗位', level: 1 });
    await waitFor(() => expect(document.querySelector('[data-job-id="j"]')).not.toBeNull());
    expect(input('job-search').value).toBe('Python');
    fireEvent.click(document.querySelector('[data-job-id="j"]')!);
    expect((input('jobs-run') as unknown as HTMLButtonElement).disabled).toBe(true);
    expect(store.getState()).toMatchObject({ resumeId: null, jdId: 'j', result: null });
    fireEvent.change(search, { target: { value: '不存在的技能' } });
    fireEvent.submit(search.closest('form')!);
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
    fireEvent.click(screen.getByRole('button', { name: '上传文件', exact: true }));
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
    fireEvent.change(input('resume-raw'), { target: { value: '用户原文' } });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(input('resume-demo-fill'));
    expect(input('resume-raw').value).toBe('用户原文');
    fireEvent.click(input('resume-demo-fill'));
    expect(input('resume-raw').value).toBe(demoResume.replace(/\r\n?/g, '\n'));
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
    const formPanel = document.querySelector('.job-form') as HTMLDetailsElement;
    formPanel.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: '添加岗位', exact: true }));
    expect(formPanel.open).toBe(true);
    expect(document.activeElement).toBe(input('jobs-title'));
    fireEvent.change(input('jobs-title'), { target: { value: '我的目标岗位' } });
    fireEvent.change(input('jobs-text'), { target: { value: '用户提供的岗位原文' } });
    fireEvent.submit(input('jobs-title').closest('form')!);
    await screen.findByText('岗位保存失败');
    expect(input('jobs-title').value).toBe('我的目标岗位');
    expect(input('jobs-text').value).toBe('用户提供的岗位原文');
    expect(store.getState().jdId).toBe('j');
    fail = false;
    fireEvent.submit(input('jobs-title').closest('form')!);
    await waitFor(() => expect(store.getState().jdId).toBe('saved-job'));
    expect(store.getState().result).toBeNull();
    expect(requests.filter((request) => request.path === '/api/v1/matches')).toHaveLength(0);
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
    fireEvent.click(screen.getByRole('button', { name: '下一条建议 →' }));
    expect(reader.textContent).toContain('完整依据 1');
    fireEvent.click(
      within(screen.getByRole('complementary', { name: '岗位重点建议列表' })).getAllByRole(
        'button',
      )[5],
    );
    expect(reader.textContent).toContain('完整依据 5');
    fireEvent.click(screen.getByRole('button', { name: /补充与核实/ }));
    expect(reader.textContent).toContain('不要虚构经历');
    expect(document.getElementById('diagnosis-summary')?.textContent).toContain('然后调整表达');
    expect(store.getState().resumeId).toBe('r');
    expect(requests.filter((request) => request.options.method === 'POST')).toHaveLength(1);
  });
});
