import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Feedback, NextLink, PageHeading } from '../components/ui';
import LibraryNav from '../components/LibraryNav';
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
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const scope = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const previewPanel = useRef<HTMLElement>(null);

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
      // Remove deleted versions immediately, even if the subsequent refresh fails.
      setRows((previous) => (row ? previous.filter((item) => item.id !== row.id) : []));
      setNotice(row ? '简历及关联记录已删除。' : `已清空 ${data.deleted_count} 份历史简历。`);
      await refresh(row ? offset : 0);
    });
  }

  const visibleRows = rows.filter((row) =>
    [row.name, row.education, ...row.skills, ...row.experience]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const preview = visibleRows.find((row) => row.id === previewId) || visibleRows[0];
  useEffect(() => {
    if (previewPanel.current) previewPanel.current.scrollTop = 0;
  }, [preview?.id]);
  return (
    <div className="page history-page">
      <div className="page-title-row">
        <PageHeading title="历史简历">查找、比较并管理你保存过的简历版本。</PageHeading>
        <div className="button-row">
          <Button
            tone="ghost"
            disabled={Boolean(busy)}
            onClick={() => void run('loading', () => refresh())}
          >
            刷新列表
          </Button>
          <Button
            tone="danger"
            disabled={Boolean(busy) || (!rows.length && !offset)}
            onClick={() => void remove()}
          >
            清空全部
          </Button>
        </div>
      </div>
      <LibraryNav kind="resume" />
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
          <h2>还没有保存的简历</h2>
          <p>导入并确认保存后，可在这里查看和管理版本。</p>
          <NextLink to="/resume">创建我的简历 →</NextLink>
        </section>
      )}
      {rows.length > 0 && (
        <div className="history-workspace">
          <section className="history-list-panel panel">
            <div className="history-toolbar">
              <div className="history-search">
                <label htmlFor="history-search">查找本页版本</label>
                <input
                  id="history-search"
                  type="search"
                  placeholder="姓名、技能或经历"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div
              className="history-list-scroll"
              aria-busy={Boolean(busy)}
              role="region"
              aria-label="已保存简历版本"
              tabIndex={0}
            >
              <p className="history-list-count">
                第 {Math.floor(offset / PAGE_SIZE) + 1} 页 · {visibleRows.length} / {rows.length}{' '}
                份版本，按保存顺序由新到旧
              </p>
              <ul className="history-version-list">
                {visibleRows.map((row) => (
                  <li key={row.id} data-selected={row.id === preview?.id}>
                    <button
                      className="history-select"
                      type="button"
                      aria-label={row.name || '未命名简历'}
                      aria-pressed={row.id === preview?.id}
                      onClick={() => setPreviewId(row.id)}
                    >
                      <span className="history-version-title">
                        <strong>{row.name || '未命名简历'}</strong>
                        {row.id === state.resumeId && <small>当前使用</small>}
                      </span>
                      <span className="history-version-excerpt">
                        {row.education || '教育背景待补充'}
                      </span>
                      <small title={row.id}>版本 …{row.id.slice(-8)}</small>
                    </button>
                    <div className="history-row-actions">
                      <Button tone="ghost" disabled={Boolean(busy)} onClick={() => void open(row)}>
                        打开简历 →
                      </Button>
                      <Button
                        tone="danger"
                        aria-label={`删除简历 ${row.name || '未命名简历'}`}
                        disabled={Boolean(busy)}
                        onClick={() => void remove(row)}
                      >
                        删除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {!visibleRows.length && (
                <p className="compact-empty">本页没有相符版本，请调整关键词或翻页查找。</p>
              )}
            </div>
          </section>
          <aside
            className="history-detail panel"
            aria-label="版本预览"
            ref={previewPanel}
            tabIndex={0}
          >
            <h2>版本预览</h2>
            {preview ? (
              <>
                <header>
                  <h3>{preview.name || '未命名简历'}</h3>
                  <p>
                    版本 …{preview.id.slice(-8)}
                    <span className="saved-badge">
                      {preview.id === state.resumeId ? '当前使用' : '已保存'}
                    </span>
                  </p>
                </header>
                <section>
                  <h3>
                    <Icon name="education" />
                    教育背景
                  </h3>
                  <p>{preview.education || '教育背景待补充'}</p>
                </section>
                <section>
                  <h3>
                    <Icon name="diagnosis" />
                    技能摘要
                  </h3>
                  <p>{preview.skills.join('、') || '尚未填写技能'}</p>
                </section>
                <section>
                  <h3>
                    <Icon name="jobs" />
                    重点经历
                  </h3>
                  {preview.experience.length ? (
                    preview.experience.map((text, i) => <p key={i}>{text}</p>)
                  ) : (
                    <p>尚未填写经历</p>
                  )}
                </section>
                <footer className="inline-actions">
                  <Button
                    tone="primary"
                    disabled={Boolean(busy)}
                    onClick={() => void open(preview)}
                  >
                    打开所选简历 <Icon name="arrow" />
                  </Button>
                  <Button
                    tone="danger"
                    disabled={Boolean(busy)}
                    onClick={() => void remove(preview)}
                  >
                    <Icon name="trash" />
                    删除所选版本
                  </Button>
                </footer>
              </>
            ) : (
              <p className="helper-text">没有相符版本，请调整关键词。</p>
            )}
          </aside>
        </div>
      )}
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
