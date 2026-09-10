import test from 'node:test';
import assert from 'node:assert/strict';
import {connectJobs} from './controller.ts';
function fixture(request, initial = {resumeId:'r',jdId:'j'}) {
  const abort = new AbortController(); let listener, disposed = 0; const views = [];
  const c = connectJobs({api:{request},getState:()=>initial,updateSelection:s=>listener(s),
    subscribe:fn=>{listener=fn;return ()=>disposed++;},signal:abort.signal},s=>views.push(s));
  return {...c,abort,views,disposed:()=>disposed};
}
const result = mock => ({data:{resume_id:'r',jd_id:'j',score:50,matched_skills:['Python'],missing_skills:['SQL'],gap_analysis:['1/2'],is_mock:mock}});
test('empty pair sends no request',async()=>{
  const f=fixture(()=>{throw Error('must not call');},{}); await f.match(); assert.match(f.views.at(-1).error,/请选择/); f.dispose();
});
test('public matching contract and Mock provenance',async()=>{
  for(const mock of [false,true]) {
    const f=fixture(async(path,options)=>{assert.equal(path,'/api/v1/matches');assert.deepEqual(options.body,{resume_id:'r',jd_id:'j'});return result(mock);});
    await f.match();assert.equal(f.views.at(-1).result.is_mock,mock);f.dispose();
  }
});
test('failure and retry remove old results',async()=>{
  let calls=0;const f=fixture(async()=>{if(++calls===1)throw Error('暂不可用');return result(false);});
  await f.match();assert.equal(f.views.at(-1).result,null);assert.equal(f.views.at(-1).busy,false);
  await f.match();assert.equal(f.views.at(-1).result.score,50);f.dispose();
});
test('selection change and navigation discard late responses',async()=>{
  for(const cancel of [false,true]) {
    let done;const f=fixture(()=>new Promise(resolve=>{done=resolve;}));const pending=f.match();
    if(cancel) f.abort.abort(); else f.choose('resumeId','other');
    const count=f.views.length;done(result(false));await pending;
    assert.equal(f.views.length,count);assert.equal(f.views.at(-1).result,null);f.dispose();assert.equal(f.disposed(),1);
  }
});
test('create preserves JD text and selects returned ID',async()=>{
  const f=fixture(async(path,options)=>{assert.equal(path,'/api/v1/jobs');assert.equal(options.body.jd_text,'  Python\nSQL  ');
    return {data:{id:'new',title:'title',jd_text:options.body.jd_text,skills:['Python','SQL']},isMock:false};});
  await f.create({title:'title',company:null,jd_text:'  Python\nSQL  '});assert.equal(f.views.at(-1).jdId,'new');f.dispose();
});
test('malformed or mismatched result rejected',async()=>{
  const bad=result(false);bad.data.jd_id='wrong';const f=fixture(async()=>bad);
  await f.match();assert.match(f.views.at(-1).error,/契约/);assert.equal(f.views.at(-1).result,null);f.dispose();
});

test('matching empty page makes no list or matching requests',async()=>{
 const abort=new AbortController();let shared={resumeId:null,jdId:null,result:null};let listener;const views=[];
 const c=connectJobs({view:'matching',api:{request:()=>{throw Error('unexpected request');}},getState:()=>shared,updateSelection:change=>{shared={...shared,...change};listener(shared);},subscribe:fn=>{listener=fn;return()=>{};},signal:abort.signal},state=>views.push(state));
 await c.load();assert.equal(views.at(-1).result,null);assert.equal(views.at(-1).error,'');c.dispose();
});
test('matching navigation restores the pair result without running it again',async()=>{
 const match=result(false).data;let shared={resumeId:'r',jdId:'j',result:{match}};let listener;const paths=[],views=[];
 const c=connectJobs({view:'matching',api:{request:async path=>{paths.push(path);return {data:{id:path.endsWith('/j')?'j':'r'}};}},getState:()=>shared,updateSelection:change=>{shared={...shared,...change};listener(shared);},subscribe:fn=>{listener=fn;return()=>{};},signal:new AbortController().signal},state=>views.push(state));
 await c.load();assert.deepEqual(paths,['/api/v1/jobs/j','/api/v1/resumes/r']);assert.equal(views.at(-1).result.score,50);c.dispose();
});

test('AI assessment failure preserves keywords; explicit retry saves only the assessment', async () => {
  const base = { ...result(false).data, id: 'm' };
  const ai = {
    score: 75,
    summary: '有项目证据',
    model: 'fixture',
    dimensions: ['skills', 'experience', 'education'].map((dimension) => ({
      dimension,
      applicable: true,
      score: 75,
      reason: '证据',
      jd_quotes: ['SQL'],
      resume_quotes: ['SQL'],
    })),
  };
  let attempts = 0;
  const f = fixture(async (path) => {
    if (path === '/api/v1/matches') return { data: base };
    assert.equal(path, '/api/v1/matches/m/assessment');
    if (++attempts === 1) throw Error('上游内容过滤');
    return { data: { ...base, score: 99, ai_assessment: ai } };
  });
  await f.match();
  await f.assess();
  assert.equal(f.views.at(-1).result.score, 50);
  assert.match(f.views.at(-1).assessmentError, /内容过滤/);
  assert.equal(attempts, 1);
  await f.assess();
  assert.equal(f.views.at(-1).result.score, 50);
  assert.equal(f.views.at(-1).result.ai_assessment.score, 75);
  await f.assess();
  assert.equal(attempts, 2);
  f.dispose();
});

test('pending AI assessment suppresses duplicate calls and discards a changed pair', async () => {
  let resolve;
  const f = fixture(async (path) =>
    path === '/api/v1/matches'
      ? { data: { ...result(false).data, id: 'm' } }
      : new Promise((done) => {
          resolve = done;
        }),
  );
  await f.match();
  const pending = f.assess();
  assert.equal(f.views.at(-1).result.score, 50);
  await f.assess();
  f.choose('resumeId', 'new');
  resolve({ data: { ...result(false).data, id: 'm', ai_assessment: {} } });
  await pending;
  assert.equal(f.views.at(-1).result, null);
  assert.equal(f.views.at(-1).assessmentBusy, false);
  f.dispose();
});
