import test from 'node:test';
import assert from 'node:assert/strict';
import resume from '../src/demo/fixtures/resume-zh.js';
import cpp from '../src/demo/fixtures/job-cpp.js';
import go from '../src/demo/fixtures/job-go.js';
import ml from '../src/demo/fixtures/job-ml.js';
import {mount as mountResume} from '../src/modules/resume/index.js';
import {mount as mountJobs} from '../src/modules/jobs/index.js';
import {createWorkspace} from '../src/core/workspace.js';

// Minimal DOM event surface: exercise the real page mount and its actual click handlers.
class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag; this.children = []; this.dataset = {}; this.value = '';
    this.classList = {toggle() {}, add() {}, remove() {}};
  }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  insertBefore(element, before) { this.children.splice(Math.max(0, this.children.indexOf(before)), 0, element); }
  get firstChild() { return this.children[0]; }
  setAttribute(name, value) { this[name] = value; }
  remove() {}
  focus() {}
  setSelectionRange() {}
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
function page(t, mount, selectedResume = false) {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const elements = [];
  globalThis.document = {head: new Element('head'), createElement(tag) {
    const element = new Element(tag); elements.push(element); return element;
  }};
  globalThis.window = Object.assign(new EventTarget(), {confirm: () => true});
  const calls = [], writes = [], workspace = createWorkspace();
  if (selectedResume) workspace.updateSelection({resumeId: 'existing-resume'});
  const context = {...workspace, signal: new AbortController().signal, api: {async request(path, options = {}) {
    calls.push({path, options});
    if (options.method === 'POST') { writes.push(options.body); throw Error('Unexpected write'); }
    return {data: path.includes('modules') ? {jobs: {is_mock: false}} : path.includes('resumes') && selectedResume
      ? [{id: 'existing-resume', name: 'Existing', skills: []}] : []};
  }}};
  const dispose = mount(new Element('main'), context); t.after(() => { dispose(); globalThis.document = oldDocument; globalThis.window = oldWindow; });
  return {calls, writes, get: id => elements.find(element => element.id === id), elements};
}
const settled = () => new Promise(resolve => setImmediate(resolve));

test('four local fixtures explicitly identify synthetic content and retain resume details', () => {
  assert.match(resume, /合成演示简历 \/ Synthetic Demo Resume/);
  for (const sample of [cpp, go, ml]) {
    assert.match(sample.text, /合成演示岗位/);
    assert.match(sample.text, /不对应真实公司或真实招聘信息/);
    assert.ok(sample.text.includes(sample.title));
  }
  for (const detail of ['张浩然', 'github.com/haoran-zhang', 'tRPC-Cpp', 'Redis Stream', 'Read-Index', 'Lease Read', '110,000+', '99.99%', 'CET-6 590']) assert.ok(resume.includes(detail));
  assert.doesNotMatch(resume, /google\.com|需要将这份简历的技术栈/);
  assert.match(go.text, /Kubernetes/); assert.match(ml.text, /PyTorch/);
});

test('resume button fills only raw text; repeated clicks and cancellation make no API calls or writes', async t => {
  const p = page(t, mountResume); await settled(); const baseline = p.calls.length;
  const raw = p.get('resume-raw'), fill = p.get('resume-demo-fill');
  raw.value = '用户正在编辑的原文'; window.confirm = () => false;
  fill.click(); assert.equal(raw.value, '用户正在编辑的原文');
  window.confirm = () => true; fill.click();
  assert.equal(raw.value, resume); assert.equal(p.get('resume-name').value, '');
  assert.equal(p.get('resume-reviewed').checked, false);
  fill.click(); await settled();
  assert.equal(p.calls.length, baseline); assert.deepEqual(p.writes, []);
});

test('all three job buttons fill their own form without save, match, diagnosis or any API request', async t => {
  const p = page(t, mountJobs, true); await settled(); const baseline = p.calls.length;
  for (const sample of [cpp, go, ml]) {
    p.get('jobs-demo-' + sample.id).click(); await settled();
    assert.equal(p.get('jobs-text').value, sample.text);
    assert.equal(p.get('jobs-title').value, sample.title);
    assert.equal(p.get('jobs-company').value, '');
    assert.equal(p.get('jobs-demo-' + sample.id).type, 'button');
  }
  window.confirm = () => false; p.get('jobs-demo-cpp').click();
  assert.equal(p.get('jobs-text').value, ml.text);
  assert.equal(p.calls.length, baseline); assert.deepEqual(p.writes, []);
});

test('demo job provenance is sent only when the user explicitly submits the form', async t => {
  const p = page(t, mountJobs, true); await settled();
  p.get('jobs-demo-cpp').click(); assert.deepEqual(p.writes, []);
  p.elements.find(element => element.tagName === 'form').dispatchEvent(new Event('submit', {cancelable: true}));
  await settled();
  assert.equal(p.writes.length, 1); assert.equal(p.writes[0].source_type, 'synthetic');
  assert.equal(p.writes[0].jd_text, cpp.text);
});
