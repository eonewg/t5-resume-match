import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chips, Feedback, NextLink, PageHeading } from '../components/ui';
import { createApi } from '../core/api';
import type { Resume } from '../core/contracts';
import type { ResumeState } from '../core/controller-types';
import { useWorkspace } from '../core/WorkspaceContext';
import { connectResume } from '../modules/resume/controller';

const PAGE_SIZE = 12;

export default function ResumeHistoryPage() {
  const { store, state, draft } = useWorkspace();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Resume[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const scope = useRef<AbortController | null>(null);
  const operation = useRef(false);

  async function refresh(nextOffset = offset) {
    if (!scope.current || scope.current.signal.aborted) return;
    const signal = scope.current.signal;
    const api = createApi({ signal });
    const { data } = await api.request<Resume[]>(
      `/api/v1/resumes?order=desc&limit=${PAGE_SIZE + 1}&offset=${nextOffset}`,
    );
    if (signal.aborted) return;
    if (!data.length && nextOffset > 0) return refresh(Math.max(0, nextOffset - PAGE_SIZE));
    setRows(data.slice(0, PAGE_SIZE));
    setHasNext(data.length > PAGE_SIZE);
    setOffset(nextOffset);
  }

  async function run(kind: string, action: () => Promise<void>) {
    if (operation.current) return;
    const signal = scope.current!.signal;
    operation.current = true;
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      if (!signal.aborted)
        setError(failure instanceof Error ? failure.message : '操作未完成，请重试。');
    } finally {
      if (!signal.aborted) {
        operation.current = false;
        setBusy('');
      }
    }
  }

  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    void run('loading', () => refresh(0));
    return () => {
      abort.abort();
      operation.current = false;
    };
  }, []);

  async function open(row: Resume) {
    await run('opening', async () => {
      const signal = scope.current!.signal;
      let latest: ResumeState | undefined;
      const controller = connectResume(
        { ...store, api: createApi({ signal }), signal },
        (value) => {
          latest = value;
        },
        draft.current,
      );
      try {
        const result = await controller.load(row.id);
        if (result?.requiresConfirmation) {
          if (!window.confirm('打开这份简历会替换当前未保存修改，是否继续？')) return;
          await controller.load(row.id, true);
        }
        if (signal.aborted) return;
        if (latest?.error) throw Error(latest.error);
        draft.current = controller.getDraft();
        navigate('/resume');
      } finally {
        controller.dispose();
      }
    });
  }

  async function remove(row?: Resume) {
    const message = row
      ? `删除「${row.name || '未命名简历'}」？相关匹配与诊断记录也会删除。未保存的编辑会保留为草稿。`
      : '清空全部历史简历？所有分页中的简历及相关匹配、诊断记录都会删除。未保存的编辑会保留为草稿。';
    if (!window.confirm(message)) return;
    await run('deleting', async () => {
      const signal = scope.current!.signal;
      const { data } = await createApi({ signal }).request<{ deleted_count: number }>(
        '/api/v1/resumes' + (row ? '/' + encodeURIComponent(row.id) : ''),
        { method: 'DELETE' },
      );
      if (signal.aborted) return;
      const deleted = (id: string | null | undefined) => Boolean(id && (!row || row.id === id));
      const current = store.getState();
      if (deleted(current.resumeId)) store.updateSelection({ resumeId: null, result: null });
      else if (
        deleted(current.result?.match?.resume_id) ||
        deleted(current.result?.diagnosis?.resume_id)
      )
        store.updateSelection({ result: null });
      if (
        draft.current &&
        (deleted(draft.current.savedId) || deleted(draft.current.pendingSave?.id))
      ) {
        draft.current = { ...draft.current, savedId: null, savedSnapshot: null, pendingSave: null };
      }
      // Remove stale cards immediately, even if the subsequent list refresh fails.
      setRows((previous) => (row ? previous.filter((item) => item.id !== row.id) : []));
      setNotice(row ? '简历及关联记录已删除。' : `已清空 ${data.deleted_count} 份历史简历。`);
      await refresh(row ? offset : 0);
    });
  }

  return (
    <div className="page history-page">
      <PageHeading eyebrow="YOUR COLLECTION" title="简历档案">
        每一份经历，都有下一种可能。打开一个版本，继续打磨你的表达。
      </PageHeading>
      <div className="history-toolbar">
        <div>
          <span className="eyebrow">SAVED VERSIONS</span>
          <p>
            第 {Math.floor(offset / PAGE_SIZE) + 1} 页 · {rows.length} 份简历
          </p>
        </div>
        <div className="button-row">
          <Button disabled={Boolean(busy)} onClick={() => void run('loading', () => refresh())}>
            刷新档案
          </Button>
          <Button
            tone="danger"
            disabled={Boolean(busy) || (!rows.length && !offset)}
            onClick={() => void remove()}
          >
            清空全部
          </Button>
          <NextLink to="/resume">回到简历编辑器 →</NextLink>
        </div>
      </div>
      <Feedback error={error} busy={Boolean(busy)}>
        {busy === 'loading'
          ? '正在读取简历档案…'
          : busy === 'opening'
            ? '正在打开简历…'
            : busy === 'deleting'
              ? '正在删除简历及关联记录…'
              : notice}
      </Feedback>
      {error && (
        <Button disabled={Boolean(busy)} onClick={() => void run('loading', () => refresh())}>
          重试读取
        </Button>
      )}
      {!rows.length && !busy && !error && (
        <section className="product-empty">
          <span className="eyebrow">A FRESH PAGE</span>
          <h2>你的故事，从第一份简历开始</h2>
          <p>保存后的版本会收在这里，随时回来继续编辑。</p>
          <NextLink to="/resume">创建我的简历 →</NextLink>
        </section>
      )}
      <div className="history-grid" aria-busy={Boolean(busy)}>
        {rows.map((row, index) => (
          <article key={row.id} className="history-card" data-selected={row.id === state.resumeId}>
            <div className="history-card-top">
              <span className="eyebrow">VERSION {String(offset + index + 1).padStart(2, '0')}</span>
              {row.id === state.resumeId && <span className="chip">当前使用</span>}
            </div>
            <h2>{row.name || '未命名简历'}</h2>
            <p className="history-education">{row.education || '教育背景待补充'}</p>
            <Chips values={row.skills.slice(0, 5)} empty="尚未填写技能" />
            <p className="history-excerpt">
              {row.experience[0] || '打开简历，补充你的项目与工作经历。'}
            </p>
            <div className="history-card-actions">
              <Button tone="primary" disabled={Boolean(busy)} onClick={() => void open(row)}>
                打开简历 →
              </Button>
              <Button
                tone="ghost"
                aria-label={`删除简历 ${row.name || '未命名简历'}`}
                disabled={Boolean(busy)}
                onClick={() => void remove(row)}
              >
                删除
              </Button>
            </div>
          </article>
        ))}
      </div>
      {(offset > 0 || hasNext) && (
        <nav className="history-toolbar" aria-label="简历档案分页">
          <Button
            disabled={Boolean(busy) || offset === 0}
            onClick={() => void run('loading', () => refresh(Math.max(0, offset - PAGE_SIZE)))}
          >
            ← 上一页
          </Button>
          <span>第 {Math.floor(offset / PAGE_SIZE) + 1} 页</span>
          <Button
            disabled={Boolean(busy) || !hasNext}
            onClick={() => void run('loading', () => refresh(offset + PAGE_SIZE))}
          >
            下一页 →
          </Button>
        </nav>
      )}
    </div>
  );
}
