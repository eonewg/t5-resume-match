import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectResume} from './controller.ts';
import {createWorkspace} from '../../core/state.ts';

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


test('upload sends multipart, shows reading state, retains source and opens review without saving', async () => {
  const f = fixture(); let resolve;
  f.override(path => path.endsWith('/upload-preview') ? new Promise(r => {resolve = r;}) : undefined);
  const file = new File(['source'], '简历 #1.txt', {type: 'text/plain'});
  const pending = f.controller.upload(file);
  assert.equal(f.state().busy, 'upload'); assert.equal(f.state().imported, false);
  assert.ok(f.calls[0].body instanceof FormData);
  assert.equal(f.calls[0].body.get('file').name, '简历 #1.txt');
  resolve({data: parsed(' extracted source '), isMock: false}); await pending;
  assert.equal(f.state().imported, true); assert.equal(f.state().busy, '');
  assert.equal(f.state().values.raw_text, ' extracted source ');
  assert.equal(f.state().values.skills, 'Python'); assert.equal(f.state().reviewed, false);
  assert.equal(f.saved.size, 0); assert.equal(f.workspace.getState().resumeId, null);
});

test('a replacement upload protects confirmed fields and requires explicit application', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'original'); await f.controller.parse();
  f.controller.edit('skills', 'SQL'); f.controller.review(true); await f.controller.save();
  f.override(path => path.endsWith('/upload-preview') ? {data: parsed('replacement')} : undefined);
  await f.controller.upload(new File(['replacement'], 'new.txt'));
  assert.equal(f.state().values.raw_text, 'replacement'); assert.equal(f.state().values.skills, 'SQL');
  assert.equal(f.state().candidate.skills, 'Python'); assert.equal(f.state().reviewed, false);
  assert.equal(f.workspace.getState().resumeId, null); assert.equal(f.saved.size, 1);
  f.controller.apply('skills'); assert.equal(f.state().values.skills, 'Python');
});

test('upload failures preserve the current resume and surface PDF extraction guidance', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'original'); await f.controller.parse();
  f.controller.review(true); await f.controller.save();
  const before = f.state().values;
  const message = '未能从该 PDF 提取有效文字。扫描版简历暂不支持，请上传可复制文字的 PDF，或直接粘贴简历文本。';
  f.override(path => path.endsWith('/upload-preview') ? Promise.reject(Error(message)) : undefined);
  await f.controller.upload(new File(['pdf'], 'scan.pdf'));
  assert.equal(f.state().error, message); assert.deepEqual(f.state().values, before);
  assert.equal(f.state().reviewed, true); assert.equal(f.workspace.getState().resumeId, 'resume_1');
});

test('invalid or empty files never send upload requests', async () => {
  const f = fixture(); await f.controller.upload(new File(['x'], 'resume.exe'));
  assert.match(f.state().error, /PDF/);
  await f.controller.upload(new File([], 'empty.txt')); assert.match(f.state().error, /为空/);
  await f.controller.upload(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.txt'));
  assert.match(f.state().error, /10 MB/); assert.equal(f.calls.length, 0);
});

test('multipart requests leave boundary generation to fetch and preserve JSON request encoding', async () => {
  const {createApi} = await import('../../core/api.ts'); const calls = [];
  const api = createApi({fetchImpl: async (path, options) => {
    calls.push({path, ...options}); return {ok: true, json: async () => ({}), headers: new Headers()};
  }});
  const body = new FormData(); body.append('file', new File(['text'], 'resume.txt'));
  await api.request('/api/v1/resumes/upload-preview', {method: 'POST', body});
  assert.equal(calls[0].body, body); assert.equal(calls[0].headers['Content-Type'], undefined);
  await api.request('/api/v1/resumes/preview', {method: 'POST', body: {raw_text: 'text'}});
  assert.equal(calls[1].headers['Content-Type'], 'application/json');
  assert.equal(calls[1].body, '{"raw_text":"text"}');
});


test('AI failure keeps pasted source, removes stale candidates and offers explicit manual editing', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'source'); await f.controller.parse();
  f.controller.edit('skills', 'User skill');
  f.override(path => path.endsWith('/preview') ? Promise.reject(Error('AI unavailable')) : undefined);
  await f.controller.parse();
  assert.equal(f.state().aiStatus, 'failed'); assert.equal(f.state().candidate, null);
  assert.equal(f.state().values.raw_text, 'source'); assert.equal(f.state().values.skills, 'User skill');
  assert.equal(f.saved.size, 0);
  f.controller.manual(); assert.equal(f.state().aiStatus, 'manual'); assert.equal(f.state().imported, true);
  assert.equal(f.state().error, ''); assert.equal(f.state().reviewed, false);
  f.controller.review(true); await f.controller.save(); assert.equal(f.saved.get('resume_1').raw_text, 'source');
});

test('upload AI failure preserves extracted original and protected fields; retry uses text preview', async () => {
  const f = fixture(); f.controller.edit('skills', 'Confirmed');
  f.override(path => path.endsWith('/upload-preview') ? Promise.reject(Object.assign(Error('AI timeout'), {rawText: '  extracted original\r\n'})) : undefined);
  await f.controller.upload(new File(['file content'], 'resume.txt'));
  assert.equal(f.state().aiStatus, 'failed'); assert.equal(f.state().values.raw_text, '  extracted original\r\n');
  assert.equal(f.state().values.skills, 'Confirmed'); assert.equal(f.state().reviewed, false);
  assert.equal(f.state().candidate, null); assert.equal(f.saved.size, 0);
  f.override(() => undefined); await f.controller.parse();
  assert.equal(f.calls.at(-1).path, '/api/v1/resumes/preview');
  assert.equal(f.state().aiStatus, 'success'); assert.match(f.state().notice, /AI 已完成/);
  assert.equal(f.state().values.skills, 'Confirmed'); assert.equal(f.state().candidate.skills, 'Python');
});

test('a stale failed AI request cannot mark an edited source as failed', async () => {
  const f = fixture(); let reject;
  f.override(() => new Promise((_, r) => {reject = r;}));
  f.controller.edit('raw_text', 'first'); const pending = f.controller.parse();
  f.controller.edit('raw_text', 'second'); reject(Error('old error')); await pending;
  assert.equal(f.state().values.raw_text, 'second'); assert.equal(f.state().error, '');
  assert.equal(f.state().aiStatus, 'idle'); assert.equal(f.state().candidate, null);
});

test('demo preview is explicitly labelled and never represented as successful live AI', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'source');
  f.override(() => ({data: parsed('source'), isMock: true})); await f.controller.parse();
  assert.equal(f.state().aiStatus, 'mock'); assert.match(f.state().notice, /不是实时 AI/);
  assert.doesNotMatch(f.state().notice, /AI 已完成/);
});

test('failed extraction does not replace the source, while navigation ignores late uploaded raw text', async () => {
  const f = fixture(); f.controller.edit('raw_text', 'previous'); let reject;
  f.override(() => new Promise((_, r) => {reject = r;}));
  const pending = f.controller.upload(new File(['data'], 'resume.txt')); f.controller.dispose();
  reject(Object.assign(Error('late AI error'), {rawText: 'late original'})); await pending;
  assert.equal(f.state().values.raw_text, 'previous');
});

test('structured AI draft with empty fields and grouped skills enters review and saves after confirmation', async () => {
  const f = fixture(), raw = '  使用 PostgreSQL 进行执行计划分析。\r\n ';
  f.override(path => path.endsWith('/preview') ? {data: {raw_text: raw, name: null, education: '', skills: ['Python, SQL / PostgreSQL'], experience: []}, isMock: false} : undefined);
  f.controller.edit('raw_text', raw); await f.controller.parse();
  assert.equal(f.state().aiStatus, 'success'); assert.equal(f.state().imported, true);
  assert.equal(f.state().reviewed, false); assert.equal(f.state().error, '');
  assert.equal(f.state().values.skills, 'Python, SQL / PostgreSQL');
  assert.equal(f.state().values.education, ''); assert.deepEqual(f.state().values.experience, []);
  assert.equal(f.state().values.raw_text, raw); assert.equal(f.saved.size, 0);
  f.controller.edit('skills', 'PostgreSQL'); f.controller.review(true); await f.controller.save();
  assert.deepEqual(f.saved.get('resume_1').skills, ['PostgreSQL']);
  assert.equal(f.saved.get('resume_1').raw_text, raw);
});

test('clear parsed fields preserves source and history, invalidates results and allows fresh reparse', async () => {
  const f = fixture(); const raw = '  原文 Python\n保留字节  ';
  f.controller.edit('raw_text', raw); await f.controller.parse(); f.controller.review(true); await f.controller.save();
  const original = structuredClone(f.saved.get('resume_1')); const calls = f.calls.length;
  f.workspace.updateSelection({result:{match:{score:90}}});
  f.controller.clearFields();
  assert.equal(f.calls.length, calls, 'clearing never writes or calls AI');
  assert.equal(f.state().values.raw_text,raw); assert.deepEqual(f.state().values.experience,[]);
  assert.equal(f.state().values.skills,''); assert.deepEqual(f.state().protectedFields,[]);
  assert.equal(f.state().reviewed,false); assert.equal(f.workspace.getState().resumeId,null);
  assert.equal(f.workspace.getState().result,null); assert.deepEqual(f.saved.get('resume_1'), original);
  await f.controller.parse(); assert.equal(f.state().values.skills,'Python');
  f.controller.reset(true); assert.equal(f.state().values.raw_text,'');
  assert.deepEqual(f.saved.get('resume_1'),original); await f.controller.load('resume_1');
  assert.equal(f.state().values.raw_text,raw);
});
