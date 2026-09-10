import { StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorkspaceProvider, useWorkspace } from '../src/core/WorkspaceContext';
import { createWorkspace } from '../src/core/state';
import type { Resume } from '../src/core/contracts';
import type { ResumeDraft } from '../src/core/controller-types';
import ResumeHistoryPage from '../src/pages/ResumeHistoryPage';

const resume = (id: string): Resume => ({
  id,
  name: `同学 ${id}`,
  education: '本科',
  raw_text: '原文',
  skills: ['Python'],
  experience: ['完成项目'],
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let records: Resume[];
let deleted: string[];
let failList: boolean;
let failDelete: boolean;
let retained: ReturnType<typeof useWorkspace>['draft'];
beforeEach(() => {
  records = [resume('r1'), resume('r2')];
  deleted = [];
  failList = false;
  failDelete = false;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, options: RequestInit = {}) => {
      if (options.method === 'DELETE') {
        if (failDelete) return json({ error: { message: '删除失败' } }, 500);
        deleted.push(path);
        const count = records.length;
        records =
          path === '/api/v1/resumes' ? [] : records.filter((item) => !path.endsWith('/' + item.id));
        return json({ deleted_count: count - records.length });
      }
      if (path.includes('?')) {
        if (failList) return json({ error: { message: '读取失败' } }, 500);
        const params = new URL(path, 'http://local').searchParams;
        const start = Number(params.get('offset'));
        return json(records.slice(start, start + Number(params.get('limit'))));
      }
      return json(records.find((item) => path.endsWith('/' + item.id)));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Probe({ initial }: { initial?: ResumeDraft }) {
  const { draft } = useWorkspace();
  useEffect(() => {
    if (initial) draft.current = initial;
    retained = draft;
  }, []);
  return null;
}
const dirtyDraft = (): ResumeDraft => ({
  values: {
    raw_text: '未保存的原文',
    name: '新名字',
    education: '',
    skills: '',
    experience: ['保留修改'],
  },
  protectedFields: [],
  reviewed: false,
  candidate: null,
  aiStatus: 'manual',
  imported: true,
  parseMock: false,
  savedId: 'r1',
  savedSnapshot: 'old-snapshot',
  pendingSave: { id: 'r1', snapshot: 'old-snapshot' },
});
function setup(initial?: ResumeDraft, strict = false) {
  const store = createWorkspace();
  store.updateSelection({ resumeId: 'r1', jdId: 'j1', result: { diagnosisRequested: true } });
  const content = (
    <MemoryRouter initialEntries={['/resume/history']}>
      <WorkspaceProvider workspace={store}>
        <Probe initial={initial} />
        <Routes>
          <Route path="/resume/history" element={<ResumeHistoryPage />} />
          <Route path="/resume" element={<p>编辑器已打开</p>} />
        </Routes>
      </WorkspaceProvider>
    </MemoryRouter>
  );
  render(strict ? <StrictMode>{content}</StrictMode> : content);
  return store;
}
const ready = async () => {
  await screen.findByText('同学 r1');
  await waitFor(() =>
    expect((screen.getByRole('button', { name: '清空全部' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
};

describe('Resume history', () => {
  it('filters version content locally without changing the selected resume', async () => {
    records[1].experience = ['整理科研数据'];
    const store = setup();
    await ready();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '科研' } });
    expect(screen.queryByText('同学 r1')).toBeNull();
    expect(screen.getByText('同学 r2')).toBeTruthy();
    expect(store.getState().resumeId).toBe('r1');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByText('同学 r1')).toBeTruthy();
    expect(deleted).toHaveLength(0);
  });

  it('deletes a selected resume and clears associations while retaining unsaved edits', async () => {
    const store = setup(dirtyDraft());
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '删除简历 同学 r1' }));
    await waitFor(() => expect(screen.queryByText('同学 r1')).toBeNull());
    expect(deleted).toEqual(['/api/v1/resumes/r1']);
    expect(store.getState()).toMatchObject({ resumeId: null, jdId: 'j1', result: null });
    expect(retained.current).toMatchObject({
      savedId: null,
      savedSnapshot: null,
      pendingSave: null,
      values: { name: '新名字', experience: ['保留修改'] },
    });
  });
  it('pages through the archive and clears records across every page', async () => {
    records = Array.from({ length: 25 }, (_, index) => resume('r' + (index + 1)));
    const store = setup();
    await ready();
    expect(screen.queryByText('同学 r13')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '下一页 →' }));
    await screen.findByText('同学 r13');
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '清空全部' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '清空全部' }));
    await screen.findByRole('heading', { name: '还没有保存的简历' });
    expect(deleted).toEqual(['/api/v1/resumes']);
    expect(records).toHaveLength(0);
    expect(store.getState().resumeId).toBeNull();
  });
  it('leaves records and selection intact when deletion fails and allows retry', async () => {
    failDelete = true;
    const store = setup();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '删除简历 同学 r1' }));
    await screen.findByText('删除失败');
    expect(store.getState().resumeId).toBe('r1');
    expect(screen.getByText('同学 r1')).toBeTruthy();
    failDelete = false;
    fireEvent.click(screen.getByRole('button', { name: '删除简历 同学 r1' }));
    await waitFor(() => expect(screen.queryByText('同学 r1')).toBeNull());
  });
  it('confirms replacing dirty edits before opening a historical version', async () => {
    const store = setup(dirtyDraft());
    await ready();
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getAllByRole('button', { name: '打开简历 →' })[1]);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(screen.queryByText('编辑器已打开')).toBeNull();
    expect(retained.current?.values.name).toBe('新名字');
    await waitFor(() =>
      expect(
        (screen.getAllByRole('button', { name: '打开简历 →' })[1] as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: '打开简历 →' })[1]);
    await screen.findByText('编辑器已打开');
    expect(store.getState().resumeId).toBe('r2');
    expect(retained.current?.savedId).toBe('r2');
  });
  it('retries a failed archive read', async () => {
    failList = true;
    setup();
    await screen.findByText('读取失败');
    failList = false;
    fireEvent.click(screen.getByRole('button', { name: '重试读取' }));
    await ready();
  });
  it('loads after StrictMode effect replay', async () => {
    setup(undefined, true);
    await ready();
  });
});
