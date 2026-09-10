import { useEffect, useRef, useState } from 'react';
import {
  connectResume,
  newSuggestion,
  type ResumeController,
} from '../modules/resume/controller.ts';
import { Link, useNavigate } from 'react-router-dom';
import { useController, useWorkspace } from '../core/WorkspaceContext';
import type { ResumeField } from '../core/controller-types';
import { fieldStatus } from '../core/ui.ts';
import Icon from '../components/Icon';
import demoResume from '../demo/fixtures/resume-zh.ts';
import { Button, Feedback, NextLink, PageHeading } from '../components/ui';

const start = (controller: ResumeController) => {
  void controller.init();
};
const labels: Record<ResumeField, string> = {
  name: '姓名',
  education: '教育背景',
  skills: '技能 / 工具',
  experience: '项目 / 工作经历',
};
export default function ResumePage() {
  const { state: s, controller } = useController(connectResume, start, 'resume');
  const navigate = useNavigate();
  const { store } = useWorkspace();
  const file = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLDetailsElement>(null);
  const source = useRef<HTMLDetailsElement>(null);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [sourceTab, setSourceTab] = useState('upload');
  const [activeField, setActiveField] = useState<ResumeField>('name');
  const [dragging, setDragging] = useState(false);
  const imported = Boolean(s?.imported || s?.savedId || s?.candidate);
  useEffect(() => {
    if (imported || s?.values.raw_text) setSourceOpen(true);
  }, [imported, Boolean(s?.values.raw_text)]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (s?.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [s?.dirty]);
  if (!s) return <p role="status">正在准备简历编辑器…</p>;
  const c = controller.current!;
  const locked = Boolean(s.busy && s.busy !== 'parse');
  const saved = Boolean(s.savedId && s.reviewed && !s.dirty && !s.pendingSave);
  const status =
    s.aiStatus === 'failed'
      ? `AI 暂时无法识别这份简历。原文已保留，可以重试或手动填写。 ${s.error}`
      : s.error ||
        (['parse', 'upload'].includes(s.busy)
          ? '正在用 AI 识别简历内容……'
          : s.busy === 'save'
            ? '正在保存简历……'
            : s.notice || (s.busy ? '正在读取简历……' : ''));
  const stage = ['parse', 'upload'].includes(s.busy)
    ? 'AI 识别中'
    : s.aiStatus === 'failed'
      ? 'AI 识别失败'
      : saved
        ? '已保存'
        : s.aiStatus === 'manual'
          ? '手动填写'
          : s.aiStatus === 'mock'
            ? '演示结果'
            : s.reviewed
              ? '已确认'
              : '待核对';
  async function load(id: string) {
    const result = await c.load(id);
    if (
      result?.requiresConfirmation &&
      window.confirm('打开这份简历会替换当前未保存修改，是否继续？')
    )
      await c.load(id, true);
    if (c.getDraft().savedId === id && history.current) history.current.open = false;
  }
  function reset() {
    if (!window.confirm('清空当前草稿并重新开始？已保存的历史简历不会删除。')) return;
    c.reset(true);
    setSourceOpen(true);
  }
  async function saveAndContinue() {
    await c.save();
    const current = c.getDraft();
    if (
      controller.current === c &&
      current.savedId &&
      !current.pendingSave &&
      current.reviewed &&
      store.getState().resumeId === current.savedId
    )
      navigate('/jobs');
  }
  function field(key: ResumeField) {
    const badge = fieldStatus(s!.values[key], s!.protectedFields.includes(key), s!.reviewed);
    const candidate = newSuggestion(s!, key);
    const differs = candidate !== null;
    return (
      <section
        id={`field-${key}`}
        className="resume-field"
        key={key}
        onFocus={() => setActiveField(key)}
      >
        <div className="resume-label-row">
          {key === 'experience' ? (
            <h3>{labels[key]}</h3>
          ) : (
            <label htmlFor={`resume-${key}`}>{labels[key]}</label>
          )}
          <span
            className="field-state"
            data-state={badge.tone}
            data-empty={badge.text === '未填写'}
            data-protected={s!.protectedFields.includes(key)}
          >
            {badge.text}
          </span>
        </div>
        {key === 'experience' ? (
          <>
            <div id="resume-experiences" className="resume-experiences">
              {s!.values.experience.map((value, index) => (
                <div className="resume-experience" key={index}>
                  <div className="resume-label-row">
                    <label htmlFor={`resume-experience-${index}`}>经历 {index + 1}</label>
                    <Button
                      tone="danger"
                      disabled={locked}
                      aria-label={`删除经历 ${index + 1}`}
                      onClick={() =>
                        c.edit(
                          'experience',
                          s!.values.experience.filter((_, i) => i !== index),
                        )
                      }
                    >
                      删除这段
                    </Button>
                  </div>
                  <textarea
                    id={`resume-experience-${index}`}
                    rows={3}
                    maxLength={50000}
                    value={value}
                    readOnly={locked}
                    onChange={(e) =>
                      c.edit(
                        'experience',
                        s!.values.experience.map((v, i) => (i === index ? e.target.value : v)),
                      )
                    }
                  />
                </div>
              ))}
              {!s!.values.experience.length && (
                <p className="compact-empty">还没有经历。整理原文，或手动添加一段。</p>
              )}
            </div>
            <Button
              id="resume-add-experience"
              disabled={locked || s!.values.experience.length >= 500}
              onClick={() => c.edit('experience', [...s!.values.experience, ''])}
            >
              添加一段经历
            </Button>
          </>
        ) : (
          <>
            {key === 'name' ? (
              <input
                id="resume-name"
                value={s!.values.name}
                readOnly={locked}
                placeholder="请输入姓名"
                onChange={(e) => c.edit('name', e.target.value)}
              />
            ) : (
              <textarea
                id={`resume-${key}`}
                rows={2}
                value={s!.values[key]}
                readOnly={locked}
                placeholder={
                  key === 'skills'
                    ? '请输入掌握的技能、工具或证书，每行一项'
                    : '请输入教育背景，例如：学校、专业、学历、时间等'
                }
                onChange={(e) => c.edit(key, e.target.value)}
              />
            )}
          </>
        )}
        <details id={`resume-suggestion-${key}`} className="resume-suggestion" hidden={!differs}>
          <summary>发现新的建议</summary>
          <pre>
            {(Array.isArray(candidate) ? candidate.join('\n\n') : candidate) || '（解析结果为空）'}
          </pre>
          <Button data-field={key} disabled={Boolean(s!.busy)} onClick={() => c.apply(key)}>
            采用这项建议
          </Button>
        </details>
      </section>
    );
  }
  return (
    <div className="resume-editor" data-module="resume">
      <div className="page-title-row">
        <PageHeading title="我的简历">上传、粘贴或编辑简历内容，右侧确认关键信息。</PageHeading>
        <Link to="/resume/history">查看历史版本 →</Link>
      </div>
      <Feedback id="resume-status" error={s.error ? status : undefined} busy={Boolean(s.busy)}>
        {status}
      </Feedback>
      <div id="resume-ai-recovery" className="resume-actions" hidden={s.aiStatus !== 'failed'}>
        <Button
          id="resume-ai-retry"
          tone="secondary"
          disabled={Boolean(s.busy)}
          onClick={() => void c.parse()}
        >
          重新识别
        </Button>
        <Button id="resume-manual" disabled={Boolean(s.busy)} onClick={c.manual}>
          手动填写
        </Button>
      </div>
      <p id="resume-mode" className="status-badge" hidden={s.parseMock !== true}>
        Mock · 演示识别，请自行核对事实
      </p>
      <div className={`resume-grid ${imported ? 'is-reviewing' : ''}`}>
        <section className="resume-import">
          <div className="resume-source-workspace">
            <div className="section-heading">
              <h2>简历原文</h2>
            </div>
            <nav className="source-tabs" aria-label="简历导入方式">
              {(
                [
                  ['upload', '上传文件'],
                  ['paste', '粘贴文本'],
                  ['ai', 'AI 识别'],
                ] as const
              ).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={sourceTab === key}
                  disabled={Boolean(s.busy)}
                  onClick={() => {
                    setSourceTab(key);
                    setSourceOpen(true);
                    if (source.current) source.current.open = true;
                    if (key === 'upload') file.current?.click();
                    else
                      document
                        .getElementById(
                          key === 'ai'
                            ? s.aiStatus === 'failed'
                              ? 'resume-ai-retry'
                              : 'resume-parse'
                            : 'resume-raw',
                        )
                        ?.focus();
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <input
              id="resume-file"
              type="file"
              ref={file}
              hidden
              accept=".pdf,.docx,.txt"
              disabled={Boolean(s.busy)}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void c.upload(selected);
                e.target.value = '';
              }}
            />
            <details
              ref={source}
              className="resume-source"
              open={sourceOpen}
              onToggle={(e) => setSourceOpen(e.currentTarget.open)}
            >
              <summary>{imported ? '查看与编辑原文' : '粘贴简历文本'}</summary>
              <label className="sr-only" htmlFor="resume-raw">
                粘贴完整原文
              </label>
              <textarea
                id="resume-raw"
                rows={10}
                maxLength={50000}
                value={s.values.raw_text}
                readOnly={locked}
                placeholder={'在这里粘贴简历内容…\n支持从 Word、PDF 或其他文档粘贴。'}
                onChange={(e) => c.edit('raw_text', e.target.value)}
              />
              <p className="resume-help">{s.values.raw_text.length} / 50000 字符</p>
              <Button
                id="resume-parse"
                hidden={s.aiStatus === 'failed'}
                tone="primary"
                disabled={Boolean(s.busy)}
                onClick={() => void c.parse()}
              >
                {s.busy === 'parse' ? 'AI 识别中…' : imported ? '重新识别原文' : '用 AI 识别简历'}
              </Button>
              <details className="helper-disclosure">
                <summary>原文与解析说明</summary>
                <p>
                  AI
                  只从原文提取信息。原文逐字保留，包括未单独展示的奖项等内容；不会自动补充经历或替换已保护字段。扫描
                  PDF 暂不支持，请粘贴文字。文件支持 PDF / DOCX / TXT，最大 10 MB。
                </p>
              </details>
            </details>
            <div className="upload-divider">
              <span>或上传文件</span>
            </div>
            <button
              id="resume-dropzone"
              type="button"
              disabled={Boolean(s.busy)}
              className={`resume-dropzone ${dragging ? 'drag-over' : ''}`}
              onClick={() => file.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!s.busy) void c.upload(e.dataTransfer.files[0]);
              }}
            >
              <Icon name="upload" />
              <span className="resume-upload-title">
                {imported ? '导入其他文件' : '点击上传或拖拽文件到此处'}
              </span>
              <span>
                支持 PDF、DOCX、TXT 格式
                <br />
                单个文件不超过 10 MB
              </span>
            </button>
            <Button
              id="resume-demo-fill"
              tone="ghost"
              disabled={Boolean(s.busy)}
              onClick={() => {
                if (
                  s.values.raw_text.trim() &&
                  s.values.raw_text !== demoResume &&
                  !window.confirm('填入示例简历会替换当前原文，是否继续？')
                )
                  return;
                c.edit('raw_text', demoResume);
                setSourceOpen(true);
              }}
            >
              填入示例简历
            </Button>
            <details className="resume-draft-tools">
              <summary>草稿操作</summary>
              <p className="helper-text">只影响当前编辑内容，已保存的历史版本不会删除。</p>
              <div className="inline-actions">
                <Button
                  id="resume-clear-fields"
                  tone="danger"
                  disabled={Boolean(s.busy)}
                  onClick={() => {
                    if (window.confirm('清空已解析字段？保留原文，之后可重新识别。'))
                      c.clearFields();
                  }}
                >
                  清空已解析字段
                </Button>
                <Button
                  id="resume-clear-draft"
                  tone="danger"
                  disabled={Boolean(s.busy)}
                  onClick={reset}
                >
                  清空当前草稿
                </Button>
              </div>
            </details>
            <details id="resume-history" className="resume-history" ref={history}>
              <summary>历史简历</summary>
              <Link className="history-manage-link" to="/resume/history">
                查看全部 / 删除与清空 ↗
              </Link>
              <div className="resume-history-list">
                {s.rows.map((row) => (
                  <button
                    type="button"
                    className="resume-history-item"
                    data-resume-id={row.id}
                    key={row.id}
                    disabled={Boolean(s.busy)}
                    onClick={() => void load(row.id)}
                  >
                    <strong>{row.name || '未命名简历'}</strong>
                    <span>{row.id === s.savedId ? '当前简历' : '已保存'}</span>
                    <small>
                      {[row.education, row.skills.join('、'), row.experience[0]]
                        .filter(Boolean)
                        .join(' · ')
                        .slice(0, 90)}
                    </small>
                  </button>
                ))}
                {!s.rows.length && <p className="resume-help">保存后的简历会出现在这里。</p>}
              </div>
              {s.historyError && (
                <Button disabled={Boolean(s.busy)} onClick={() => void c.refresh(s.offset)}>
                  重试读取历史简历
                </Button>
              )}
              {(s.offset > 0 || s.rows.length >= 20) && (
                <div>
                  <Button
                    disabled={Boolean(s.busy) || s.offset === 0}
                    onClick={() => void c.refresh(Math.max(0, s.offset - 20))}
                  >
                    较新的简历
                  </Button>
                  <Button
                    disabled={Boolean(s.busy) || s.rows.length < 20}
                    onClick={() => void c.refresh(s.offset + 20)}
                  >
                    更早的简历
                  </Button>
                </div>
              )}
            </details>
          </div>
        </section>
        <section className="resume-fields" aria-label="简历编辑区">
          <div className="section-heading">
            <h2>确认内容</h2>
            <span
              id="resume-stage"
              className="status-badge"
              data-state={s.busy ? 'busy' : saved ? 'success' : 'neutral'}
            >
              {stage}
            </span>
          </div>
          <nav className="field-navigation" aria-label="简历字段">
            {(Object.keys(labels) as ResumeField[]).map((key) => (
              <a
                key={key}
                href={`#field-${key}`}
                aria-current={activeField === key ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setActiveField(key);
                  document.getElementById(`field-${key}`)?.scrollIntoView({ block: 'start' });
                  document
                    .getElementById(key === 'experience' ? 'resume-experience-0' : `resume-${key}`)
                    ?.focus({ preventScroll: true });
                }}
              >
                {key === 'name' ? '基本信息' : labels[key]}
              </a>
            ))}
          </nav>
          {saved && (
            <div className="resume-confirmed-action">
              <NextLink id="resume-next" to="/jobs">
                确认并进入目标岗位 →
              </NextLink>
            </div>
          )}
          <div className="resume-basics">
            {field('name')}
            {field('education')}
          </div>
          {field('skills')}
          {field('experience')}
          <section className="resume-save-panel" hidden={saved}>
            <label className="resume-confirm">
              <input
                id="resume-reviewed"
                type="checkbox"
                checked={s.reviewed}
                disabled={Boolean(s.busy)}
                onChange={(e) => c.review(e.target.checked)}
              />
              <span>我已核对以上简历内容，未确认的信息保持空白。</span>
            </label>
            <div className="resume-actions">
              <Button
                id="resume-save"
                tone="ghost"
                disabled={Boolean(s.busy) || !s.reviewed || !s.values.raw_text.trim()}
                onClick={() => void c.save()}
              >
                {s.busy === 'save'
                  ? '保存并核对中…'
                  : s.pendingSave
                    ? '重试确认保存'
                    : '确认并保存'}
              </Button>
              <Button
                id="resume-save-next"
                tone="primary"
                disabled={Boolean(s.busy) || !s.reviewed || !s.values.raw_text.trim()}
                onClick={() => void saveAndContinue()}
              >
                确认并进入目标岗位
              </Button>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
