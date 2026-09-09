import test from "node:test";
import assert from "node:assert/strict";
import { connectDiagnosis } from "./controller.ts";

function fixture(request, state = { resumeId: "r", jdId: "j", result: null }) {
  const abort = new AbortController();
  let listener;
  let removed = 0;
  const views = [];
  const controller = connectDiagnosis({ api: { request }, getState: () => state,
    subscribe: fn => { listener = fn; return () => removed++; }, signal: abort.signal },
  view => views.push(view));
  return { ...controller, abort, views, update: next => listener(next), removed: () => removed };
}
const record = (mock = false) => ({ data: { id: "d", resume_id: "r", jd_id: "j", summary: "摘要",
  suggestions: ["【STAR】原文、优化、理由"], is_mock: mock } });

test("missing selection never calls API", async () => {
  const f = fixture(() => { throw Error("must not call"); }, {});
  await f.run(); assert.match(f.views.at(-1).error, /选择/); f.dispose();
});
test("uses public pair contract and distinguishes Mock and real", async () => {
  for (const mock of [true, false]) {
    const f = fixture(async (url, options) => {
      assert.equal(url, "/api/v1/diagnoses");
      assert.deepEqual(options.body, { resume_id: "r", jd_id: "j" });
      return record(mock);
    });
    await f.run(); assert.equal(f.views.at(-1).record.is_mock, mock); f.dispose();
  }
});
test("errors clear stale output and allow retry", async () => {
  let calls = 0;
  const f = fixture(async () => { if (++calls === 1) throw Error("服务失败"); return record(); });
  await f.run(); assert.equal(f.views.at(-1).record, null); assert.equal(f.views.at(-1).busy, false);
  await f.run(); assert.equal(f.views.at(-1).record.id, "d"); f.dispose();
});

test("content filter never retries itself and allows edited selection recovery", async () => {
  let calls = 0;
  const f = fixture(async (_url, options) => {
    calls++;
    if (calls === 1) throw Error("上游模型内容过滤，未生成简历诊断");
    assert.equal(options.body.jd_id, "edited");
    const response = record(); response.data.jd_id = "edited"; return response;
  });
  await f.run();
  assert.equal(calls, 1);
  assert.equal(f.views.at(-1).record, null);
  assert.equal(f.views.at(-1).busy, false);
  assert.match(f.views.at(-1).error, /修改输入、保存后重新诊断/);
  f.update({resumeId: "r", jdId: "edited", result: null});
  assert.equal(calls, 1);
  assert.equal(f.views.at(-1).error, "");
  await f.run();
  assert.equal(calls, 2);
  assert.equal(f.views.at(-1).record.jd_id, "edited");
  f.dispose();
});
test("changed selection discards pending responses", async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const pending = f.run(); f.update({ resumeId: "new", jdId: "j" });
  resolve(record()); await pending; assert.equal(f.views.at(-1).record, null); f.dispose();
});
test("navigation releases subscription and suppresses late output", async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const pending = f.run(); f.abort.abort(); const count = f.views.length;
  resolve(record()); await pending; f.dispose();
  assert.equal(f.views.length, count); assert.equal(f.removed(), 1);
});
test("duplicate click and mismatched response cannot display incorrect records", async () => {
  let calls = 0, resolve;
  const f = fixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = f.run(); await f.run(); assert.equal(calls, 1);
  const wrong = record(); wrong.data.resume_id = "someone-else";
  resolve(wrong); await pending;
  assert.equal(f.views.at(-1).record, null); assert.match(f.views.at(-1).error, /契约/); f.dispose();
});

test('optimization link intent generates once and preserves matching context',async()=>{
 let state={resumeId:'r',jdId:'j',result:{match:{score:50},diagnosisRequested:true}},listener,calls=0;
 const views=[];const c=connectDiagnosis({api:{request:async()=>{calls++;return record();}},getState:()=>state,subscribe:fn=>{listener=fn;return()=>{};},updateSelection:change=>{state={...state,...change};listener(state);},signal:new AbortController().signal},s=>views.push(s));
 await c.startRequested();await c.startRequested();assert.equal(calls,1);assert.equal(state.result.match.score,50);assert.equal(state.result.diagnosisRequested,false);assert.equal(views.at(-1).record.id,'d');c.dispose();
});
test('optimization navigation uses an existing result and normal navigation does not generate',async()=>{
 for(const existing of [false,true]){
  let state={resumeId:'r',jdId:'j',result:existing?{diagnosisRequested:true,diagnosis:record().data}:{}},listener,calls=0;
  const c=connectDiagnosis({api:{request:async()=>{calls++;return record();}},getState:()=>state,subscribe:fn=>{listener=fn;return()=>{};},updateSelection:change=>{state={...state,...change};listener(state);},signal:new AbortController().signal},()=>{});
  await c.startRequested();assert.equal(calls,0);c.dispose();
 }
});
