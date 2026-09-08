import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectResume} from './controller.js';
import {createWorkspace} from '../../core/workspace.js';

const parsed = raw => ({raw_text: raw, name: null, education: '本科', skills: ['Python'], experience: ['使用 Python 处理课程数据。']});
function fixture(retained = null) {
  const abort = new AbortController(), workspace = createWorkspace(), calls = [], saved = new Map();
  let state, override = null;
  const api = {async request(path, options = {}) {
    calls.push({path, ...options});
    if (override) { const result = override(path, options); if (result !== undefined) return result; }
    if (path.endsWith('/preview')) return {data: parsed(options.body.raw_text), isMock: false};
    if (options.method === 'POST') {
      const data = {...structuredClone(options.body), id: `resume_${saved.size + 1}`}; saved.set(data.id, data); return {data};
    }
    if (path.includes('?')) return {data: [...saved.values()]};
    return {data: structuredClone(saved.get(path.split('/').at(-1))), isMock: false};
  }};
  const controller = connectResume({api, signal: abort.signal, ...workspace}, next => {state = next;}, retained);
  return {controller, calls, saved, workspace, abort, state: () => state, override(fn) {override = fn;}};
}

test('preview never persists and editing or clearing a field protects it against reparse', async () => {
  const f = fixture(); f.controller.edit('raw_text', '原文技能 Python'); await f.controller.parse();
  assert.deepEqual(f.state().values.skills, 'Python'); assert.equal(f.saved.size, 0);
  f.controller.edit('skills', 'SQL\nJAX'); f.controller.edit('experience', []); f.controller.edit('education', '');
  await f.controller.parse();
  assert.equal(f.state().values.skills, 'SQL\nJAX');
  assert.deepEqual(f.state().values.experience, []); assert.equal(f.state().values.education, '');
  assert.equal(f.state().candidate.skills, 'Python');
  f.controller.apply('skills'); assert.equal(f.state().values.skills, 'Python');
  assert.equal(f.state().reviewed, false);
});

test('confirming all fields protects intentional blanks, even when raw source changes', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'first'); f.controller.review(true);
  f.controller.edit('raw_text', 'second'); await f.controller.parse();
  assert.equal(f.state().values.skills, ''); assert.deepEqual(f.state().values.experience, []);
  assert.equal(f.state().values.raw_text, 'second'); assert.equal(f.state().reviewed, false);
});

test('an edit during parsing wins and a changed raw source rejects stale suggestions', async () => {
  const f = fixture(); let resolve;
  f.override(path => path.endsWith('/preview') ? new Promise(r => {resolve = r;}) : undefined);
  f.controller.edit('raw_text', 'first'); const first = f.controller.parse();
  f.controller.edit('skills', 'Confirmed'); resolve({data: parsed('first')}); await first;
  assert.equal(f.state().values.skills, 'Confirmed');
  const next = f.controller.parse(); f.controller.edit('raw_text', 'second');
  resolve({data: parsed('first')}); await next;
  assert.equal(f.state().candidate, null); assert.match(f.state().notice, /旧解析结果未应用/);
});

test('confirmed arrays save and reread exactly before selecting a resume; unchanged save creates no duplicate', async () => {
  const f = fixture(); const raw = '  技能：Python\r\n原文保持  ';
  f.controller.edit('raw_text', raw); await f.controller.parse();
  f.controller.edit('skills', 'SQL\n自定义技能');
  f.controller.edit('experience', ['第一段\n保留换行', '第二段']); f.controller.edit('name', '用户确认姓名');
  f.controller.review(true); await f.controller.save();
  const saved = f.saved.get('resume_1');
  assert.equal(saved.raw_text, raw); assert.deepEqual(saved.skills, ['SQL', '自定义技能']);
  assert.deepEqual(saved.experience, ['第一段\n保留换行', '第二段']);
  assert.equal(f.workspace.getState().resumeId, 'resume_1'); assert.equal(f.state().dirty, false);
  assert.equal(f.calls.at(-1).path, '/api/v1/resumes/resume_1');
  await f.controller.save(); assert.equal(f.saved.size, 1);
  f.controller.edit('skills', ''); assert.equal(f.workspace.getState().resumeId, null);
  f.controller.review(true); await f.controller.save();
  assert.equal(f.saved.size, 2); assert.deepEqual(f.saved.get('resume_2').skills, []);
  assert.deepEqual(saved.skills, ['SQL', '自定义技能']);
});

test('save requires explicit review and preserves input on API errors', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'source'); await f.controller.save();
  assert.match(f.state().error, /核对并确认/); assert.equal(f.calls.length, 0);
  f.controller.review(true); f.override(() => Promise.reject(Error('offline'))); await f.controller.save();
  assert.equal(f.state().values.raw_text, 'source'); assert.equal(f.workspace.getState().resumeId, null);
});

test('reread failure retries GET without another POST and never selects unverified output', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'source'); f.controller.review(true);
  f.override((path, options) => path === '/api/v1/resumes/resume_1' && !options.method ? Promise.reject(Error('read failed')) : undefined);
  await f.controller.save(); assert.equal(f.saved.size, 1); assert.equal(f.workspace.getState().resumeId, null);
  assert.match(f.state().error, /保存已成功/);
  f.override(() => undefined); await f.controller.save();
  assert.equal(f.saved.size, 1); assert.equal(f.workspace.getState().resumeId, 'resume_1');
});

test('mismatched reread is not silently accepted', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'source'); f.controller.edit('skills', 'SQL'); f.controller.review(true);
  f.override(path => path === '/api/v1/resumes/resume_1' ? {data: {...parsed('source'), id: 'resume_1'}} : undefined);
  await f.controller.save();
  assert.match(f.state().error, /不一致/); assert.equal(f.state().values.skills, 'SQL');
  assert.equal(f.workspace.getState().resumeId, null);
});

test('loading existing versions protects fields and requires explicit discard for unsaved edits', async () => {
  const f = fixture(); f.saved.set('old', {...parsed('old source'), id: 'old', skills: ['SQL']});
  f.controller.edit('raw_text', 'unsaved'); const result = await f.controller.load('old');
  assert.equal(result.requiresConfirmation, true); assert.equal(f.calls.length, 0);
  await f.controller.load('old', true); assert.equal(f.state().values.skills, 'SQL');
  await f.controller.parse(); assert.equal(f.state().values.skills, 'SQL');
  assert.equal(f.state().savedId, 'old');
});

test('in-app navigation retains edited drafts but late responses cannot update shared selection', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'private draft'); f.controller.edit('skills', 'JAX');
  const retained = f.controller.getDraft(); f.controller.dispose();
  const next = fixture(retained); assert.equal(next.state().values.skills, 'JAX'); assert.equal(next.state().dirty, true);
  let resolve;
  next.override(() => new Promise(r => {resolve = r;}));
  const load = next.controller.load('late', true); next.abort.abort();
  resolve({data: {...parsed('late'), id: 'late'}}); await load;
  assert.equal(next.workspace.getState().resumeId, null);
});
