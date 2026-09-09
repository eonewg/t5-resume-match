import { useEffect, useRef, useState } from 'react';
import { connectResume, type ResumeController } from '../modules/resume/controller.ts';
import { useController } from '../core/WorkspaceContext';
import type { ResumeField } from '../core/controller-types';
import { fieldStatus } from '../core/ui.ts';
import demoResume from '../demo/fixtures/resume-zh.ts';
import { Button, Chips, Feedback, NextLink } from '../components/ui';

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
  const file = useRef<HTMLInputElement>(null);
  const history = useRef<HTMLDetailsElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
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
    const result = c.reset();
    if (
      result?.requiresConfirmation &&
      window.confirm('导入另一份简历会清空当前未保存修改，是否继续？')
    )
      c.reset(true);
    setSourceOpen(false);
  }
  function field(key: ResumeField) {
    const badge = fieldStatus(s!.values[key], s!.protectedFields.includes(key), s!.reviewed);
    const candidate = s!.candidate?.[key];
    const differs = s!.candidate && JSON.stringify(candidate) !== JSON.stringify(s!.values[key]);
    return (
      <section className="resume-field" key={key}>
        <div className="resume-label-row">
          {key === 'experience' ? (
            <h3>{labels[key]}</h3>
          ) : (
            <label htmlFor={`resume-${key}`}>{labels[key]}</label>
          )}
          <span
            className="resume-field-badge"
            data-state={badge.tone}
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
            {key === 'skills' && s!.values.skills.trim() && (
              <Chips
                className="resume-skill-chips"
                values={s!.values.skills.split(/\r?\n/).filter(Boolean)}
              />
            )}
            {key === 'name' ? (
              <input
                id="resume-name"
                value={s!.values.name}
                readOnly={locked}
                placeholder="填写姓名"
                onChange={(e) => c.edit('name', e.target.value)}
              />
            ) : (
              <textarea
                id={`resume-${key}`}
                rows={2}
                value={s!.values[key]}
                readOnly={locked}
                placeholder={key === 'skills' ? '每行一项技能' : '学校、专业与学历'}
                onChange={(e) => c.edit(key, e.target.value)}
              />
            )}
            {key === 'skills' && (
              <p className="resume-help">每行一项，仅填写你具备的技能。清空也会保留。</p>
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
      <div className="section-heading">
        <div>
          <p className="eyebrow">01 / 确认事实</p>
          <h1 tabIndex={-1}>我的简历</h1>
        </div>
        <details id="resume-history" className="resume-history" ref={history}>
          <summary>历史简历</summary>
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
          <Button id="resume-new" tone="ghost" disabled={Boolean(s.busy)} onClick={reset}>
            导入另一份简历
          </Button>
        </details>
      </div>
      <p className="resume-lead">先上传或粘贴简历。AI 识别后，由你核对并保存，再继续选择岗位。</p>
      <Feedback id="resume-status" error={s.error ? status : undefined} busy={Boolean(s.busy)}>
        {status}
      </Feedback>
      <div id="resume-ai-recovery" className="resume-actions" hidden={s.aiStatus !== 'failed'}>
        <Button
          id="resume-ai-retry"
          tone="primary"
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
      {saved && (
        <div className="next-action card">
          <div>
            <strong>简历已确认，可以开始找方向了</strong>
            <p>下一步：选择你准备申请的岗位。</p>
          </div>
          <NextLink id="resume-next" to="/jobs">
            选择目标岗位 →
          </NextLink>
        </div>
      )}
      <div className={`resume-grid ${imported ? 'is-reviewing' : ''}`}>
        <section className="resume-import">
          <button
            id="resume-dropzone"
            type="button"
            hidden={imported || s.aiStatus === 'failed'}
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
            <span className="resume-upload-title">上传简历</span>
            <span>拖入简历，或点击选择文件</span>
            <small>PDF / DOCX / TXT · 最大 10 MB</small>
          </button>
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
            className="card resume-source"
            open={sourceOpen}
            onToggle={(e) => setSourceOpen(e.currentTarget.open)}
          >
            <summary>{imported ? '简历原文与重新整理' : '或直接粘贴简历文本'}</summary>
            <label htmlFor="resume-raw">粘贴完整原文</label>
            <textarea
              id="resume-raw"
              rows={10}
              maxLength={50000}
              value={s.values.raw_text}
              readOnly={locked}
              placeholder="在这里粘贴教育背景、技能和项目经历…"
              onChange={(e) => c.edit('raw_text', e.target.value)}
            />
            <p className="resume-help">{s.values.raw_text.length} / 50000 字符</p>
            <Button
              id="resume-parse"
              hidden={s.aiStatus === 'failed'}
              tone={imported ? 'secondary' : 'primary'}
              disabled={Boolean(s.busy)}
              onClick={() => void c.parse()}
            >
              {s.busy === 'parse' ? 'AI 识别中…' : imported ? '重新识别原文' : '用 AI 识别简历'}
            </Button>
            <Button
              id="resume-replace-file"
              tone="ghost"
              disabled={Boolean(s.busy)}
              onClick={() => file.current?.click()}
            >
              改用文件导入
            </Button>
            <details className="helper-disclosure">
              <summary>原文与解析说明</summary>
              <p>
                AI
                只从原文提取信息。原文逐字保留，包括未单独展示的奖项等内容；不会自动补充经历或替换已保护字段。扫描
                PDF 暂不支持，请粘贴文字。
              </p>
            </details>
          </details>
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
          <p className="resume-help">合成演示简历，仅填入原文；识别、核对和保存均由你发起。</p>
        </section>
        <section className="card resume-fields" hidden={!imported}>
          <div className="section-heading">
            <h2>核对简历</h2>
            <span
              id="resume-stage"
              className="status-badge"
              data-state={s.busy ? 'busy' : saved ? 'success' : 'neutral'}
            >
              {stage}
            </span>
          </div>
          <p className="resume-help">
            AI 识别不等于事实认证。请逐项核对；你修改或确认过的字段（包括空值）会保留。
          </p>
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
                tone={s.reviewed ? 'primary' : 'secondary'}
                disabled={Boolean(s.busy) || !s.reviewed || !s.values.raw_text.trim()}
                onClick={() => void c.save()}
              >
                {s.busy === 'save'
                  ? '保存并核对中…'
                  : s.pendingSave
                    ? '重试确认保存'
                    : '确认并保存'}
              </Button>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
