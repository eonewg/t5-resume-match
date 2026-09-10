import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createApi, type Api } from '../core/api';
import type { JD, JDCreate } from '../core/contracts';
import { failureMessage } from '../core/errors';
import { useWorkspace } from '../core/WorkspaceContext';
import {
  applyJobPreview,
  emptyJobDraft,
  jobLabels,
  jobPayload,
  type JobField,
} from '../modules/jobs/draft';
import LibraryNav from '../components/LibraryNav';
import ScreenshotImport from '../components/ScreenshotImport';
import { Button, Feedback } from '../components/ui';
import Icon from '../components/Icon';
import cpp from '../demo/fixtures/job-cpp';
import go from '../demo/fixtures/job-go';
import ml from '../demo/fixtures/job-ml';

const groups: { name: string; fields: JobField[] }[] = [
  {
    name: '基本信息',
    fields: [
      'title',
      'company',
      'location',
      'salary',
      'education_requirement',
      'experience_requirement',
    ],
  },
  { name: '职责与要求', fields: ['responsibilities', 'requirements', 'preferred_qualifications'] },
  { name: '技能与工具', fields: ['skills', 'tools'] },
];
const multiline = new Set<JobField>([
  'responsibilities',
  'requirements',
  'preferred_qualifications',
]);

export default function JobCreatePage() {
  const { store, jobDraft } = useWorkspace();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => structuredClone(jobDraft.current || emptyJobDraft()));
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const documentPicker = useRef<HTMLInputElement>(null);
  const api = useRef<Api | null>(null);
  const alive = useRef(false);
  const locked = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    api.current = createApi({ signal: abort.signal });
    alive.current = true;
    return () => {
      alive.current = false;
      abort.abort();
    };
  }, []);
  useEffect(() => {
    jobDraft.current = draft;
  }, [draft, jobDraft]);
  const dirty =
    Object.values(draft.values).some(Boolean) &&
    JSON.stringify(jobPayload(draft)) !== draft.savedSnapshot;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const edit = (key: JobField, value: string) =>
    setDraft((previous) => ({
      ...previous,
      values: { ...previous.values, [key]: value },
      protectedFields:
        key === 'jd_text'
          ? previous.protectedFields
          : [...new Set([...previous.protectedFields, key])],
    }));
  async function task(kind: string, work: () => Promise<void>) {
    if (locked.current || !api.current) return;
    locked.current = true;
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      if (alive.current) setError(failureMessage(err));
    } finally {
      locked.current = false;
      if (alive.current) setBusy('');
    }
  }
  const recognize = (file?: File) =>
    task('recognize', async () => {
      let body: FormData | { raw_text: string };
      if (file) {
        body = new FormData();
        body.append('file', file);
      } else {
        if (!draft.values.jd_text.trim()) throw Error('请先粘贴岗位原文或导入文档。');
        body = { raw_text: draft.values.jd_text };
      }
      const response = await api.current!.request<JDCreate>(
        file ? '/api/v1/jobs/upload-preview' : '/api/v1/jobs/preview',
        { method: 'POST', body },
      );
      if (!alive.current) return;
      if (response.isMock) throw Error('本次返回演示数据，未作为真实识别结果填入。');
      setDraft((previous) =>
        applyJobPreview(
          { ...previous, synthetic: file ? false : previous.synthetic },
          response.data,
        ),
      );
      setNotice('已识别为可编辑草稿。手动填写过的字段保持不变，可逐项采用本次建议。');
    });
  const importDocument = (file?: File) =>
    task('document', async () => {
      if (!file) return;
      if (!/\.(pdf|docx|txt)$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024)
        throw Error('请选择 PDF、DOCX 或 TXT 文档，文件须非空且不超过 10 MB。');
      const body = new FormData();
      body.append('file', file);
      const response = await api.current!.request<{ raw_text: string }>(
        '/api/v1/jobs/extract-text',
        { method: 'POST', body },
      );
      if (!alive.current) return;
      setDraft((previous) => ({
        ...previous,
        synthetic: false,
        values: { ...previous.values, jd_text: response.data.raw_text },
      }));
      setNotice('文档文字已导入。点击“用 AI 识别岗位”提取字段，或直接手动填写。');
    });
  const save = () =>
    task('save', async () => {
      const payload = jobPayload(draft);
      if (
        !payload.title.trim() ||
        !(
          payload.jd_text.trim() ||
          payload.responsibilities?.trim() ||
          payload.requirements?.trim()
        )
      )
        throw Error('请填写岗位名称，并补充职责、任职要求或原文。');
      const snapshot = JSON.stringify(payload);
      let id = draft.savedSnapshot === snapshot ? draft.savedId : null;
      if (!id) {
        const response = await api.current!.request<JD>('/api/v1/jobs', {
          method: 'POST',
          body: payload,
        });
        if (!alive.current) return;
        id = response.data.id;
        if (typeof id !== 'string' || !id) throw Error('保存响应缺少岗位标识，请刷新岗位库核对。');
        setDraft((previous) => ({ ...previous, savedId: id, savedSnapshot: snapshot }));
      }
      const saved = await api.current!.request<JD>('/api/v1/jobs/' + encodeURIComponent(id!));
      if (saved.data.id !== id) throw Error('保存后的岗位校验失败，请重试读取。');
      if (!alive.current) return;
      store.updateSelection({ jdId: id, isMock: true });
      navigate('/jobs');
    });
  return (
    <div className="job-create-page" data-module="jobs-create">
      <div className="page-title-row">
        <LibraryNav kind="jobs">导入岗位要求，在右侧核对后保存；也可以直接手动填写。</LibraryNav>
      </div>
      <Feedback error={error} busy={Boolean(busy)}>
        {busy
          ? {
              document: '正在提取文档文字…',
              recognize: '正在识别岗位要求…',
              save: '正在保存岗位…',
            }[busy]
          : notice}
      </Feedback>
      <div className="job-editor-grid">
        <section className="job-source-panel panel">
          <div className="section-heading">
            <h2>岗位原文</h2>
            <Button
              tone="secondary"
              disabled={Boolean(busy)}
              onClick={() => documentPicker.current?.click()}
            >
              <Icon name="upload" />
              上传文档
            </Button>
          </div>
          <input
            hidden
            ref={documentPicker}
            aria-label="导入岗位文档"
            type="file"
            accept=".pdf,.docx,.txt"
            disabled={Boolean(busy)}
            onChange={(e) => {
              void importDocument(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <ScreenshotImport subject="岗位" busy={Boolean(busy)} onRecognize={recognize} />
          <label htmlFor="jobs-text">岗位原文（保留备查）</label>
          <textarea
            id="jobs-text"
            value={draft.values.jd_text}
            maxLength={50000}
            rows={15}
            readOnly={Boolean(busy)}
            placeholder="在这里粘贴岗位介绍、职责和任职要求…"
            onChange={(e) => edit('jd_text', e.target.value)}
          />
          <p className="helper-text">
            {draft.values.jd_text.length} / 50000 字符 · 文档支持 PDF / DOCX / TXT，最大 10 MB
          </p>
          <Button
            tone="primary"
            disabled={Boolean(busy) || !draft.values.jd_text.trim()}
            onClick={() => void recognize()}
          >
            用 AI 识别岗位
          </Button>
          <details className="job-demo-options">
            <summary>使用合成示例</summary>
            <p>只填入原文，识别与保存均需主动发起。</p>
            <div className="inline-actions">
              {[cpp, go, ml].map((sample) => (
                <Button
                  key={sample.id}
                  id={`jobs-demo-${sample.id}`}
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (dirty && !window.confirm('填入示例会替换当前草稿，是否继续？')) return;
                    setDraft({
                      ...emptyJobDraft(),
                      values: {
                        ...emptyJobDraft().values,
                        title: sample.title,
                        jd_text: sample.text,
                      },
                      synthetic: true,
                    });
                  }}
                >
                  {sample.title}
                </Button>
              ))}
            </div>
          </details>
        </section>
        <form
          className="job-fields-panel panel"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="section-heading">
            <h2>确认岗位内容</h2>
            <span className="status-badge">{draft.synthetic ? '合成演示' : '待核对'}</span>
          </div>
          <div className="job-editor-tabs" role="tablist" aria-label="岗位字段分组">
            {groups.map((group, index) => (
              <button
                key={group.name}
                type="button"
                role="tab"
                id={`job-editor-tab-${index}`}
                aria-controls="job-editor-fields"
                aria-selected={index === tab}
                onClick={() => setTab(index)}
              >
                {group.name}
              </button>
            ))}
          </div>
          <div id="job-editor-fields" role="tabpanel" aria-labelledby={`job-editor-tab-${tab}`}>
            {groups[tab].fields.map((key) => (
              <div className="job-editor-field" key={key}>
                <label htmlFor={`jobs-${key}`}>
                  {jobLabels[key]}
                  {draft.protectedFields.includes(key) && <small>已手动编辑</small>}
                </label>
                {multiline.has(key) ? (
                  <textarea
                    id={`jobs-${key}`}
                    rows={6}
                    maxLength={12000}
                    value={draft.values[key]}
                    readOnly={Boolean(busy)}
                    onChange={(e) => edit(key, e.target.value)}
                  />
                ) : (
                  <input
                    id={`jobs-${key}`}
                    maxLength={key === 'skills' || key === 'tools' ? 50000 : 200}
                    value={draft.values[key]}
                    readOnly={Boolean(busy)}
                    onChange={(e) => edit(key, e.target.value)}
                  />
                )}
                {draft.candidate &&
                  draft.protectedFields.includes(key) &&
                  draft.candidate[key] !== draft.values[key] && (
                    <details className="job-field-suggestion">
                      <summary>查看本次识别建议</summary>
                      <p>{draft.candidate[key] || '未识别到内容'}</p>
                      <Button
                        disabled={Boolean(busy)}
                        onClick={() => edit(key, draft.candidate![key])}
                      >
                        采用此字段
                      </Button>
                    </details>
                  )}
              </div>
            ))}
          </div>
          <div className="job-editor-footer">
            <Button tone="primary" type="submit" disabled={Boolean(busy)}>
              保存并选中
            </Button>
            <Button
              disabled={Boolean(busy)}
              onClick={() => {
                if (!dirty || window.confirm('清空当前草稿？已保存的岗位不会删除。')) {
                  setDraft(emptyJobDraft());
                  setNotice('');
                  setError('');
                }
              }}
            >
              新建空白岗位
            </Button>
          </div>
          <p className="helper-text">未填写的事实保持空白；只有保存后才会加入岗位库并用于匹配。</p>
        </form>
      </div>
    </div>
  );
}
