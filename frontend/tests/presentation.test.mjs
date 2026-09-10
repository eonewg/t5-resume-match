import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSuggestion,userText,naturalRewrite,diagnosisNote,jobSuggestion} from '../src/core/presentation.ts';
import {connectJobs} from '../src/modules/jobs/controller.ts';
import {createWorkspace} from '../src/core/state.ts';
import {fieldStatus} from '../src/core/ui.ts';

test('confirmed or protected empty fields never look like confirmed content',()=>{
  for(const value of ['', '  ', [], ['', '  ']]) {
    assert.deepEqual(fieldStatus(value,true,true),{text:'未填写',tone:'neutral'});
  }
  assert.deepEqual(fieldStatus(['SQL'],true,true),{text:'已确认',tone:'success'});
  assert.equal(fieldStatus('学校',true,false).text,'已修改');
  assert.equal(fieldStatus('学校',false,false).text,'待核对');
});

test('STAR comparison preserves exact original, numbers and suggestion; unknown formats stay intact',()=>{
  const text='【STAR】原文： 处理 120 条。\n优化：处理 120 条，【待补充】。\n理由：更清晰';
  assert.deepEqual(splitSuggestion(text),{original:' 处理 120 条。',suggested:'处理 120 条，【待补充】。',reason:'更清晰'});
  assert.equal(splitSuggestion('【STAR】unsupported output with <img>'),null);
  assert.equal(userText('Mock JD unknown 公共契约'),'演示数据 岗位要求 暂未提供 预期格式');
});

test('older labelled rewrites keep facts and placeholders; ordinary prose stays unchanged',()=>{
  const saved = '情境：课程项目；任务：清洗数据；行动：用 Python 处理 120 条；结果：【待补充：实际效果】';
  assert.equal(naturalRewrite(saved), '课程项目；清洗数据；用 Python 处理 120 条；【待补充：实际效果】');
  const ordinary = '任务：记录包含“结果：”的日志，保留 <img> 文本。';
  assert.equal(naturalRewrite(ordinary), ordinary);
  assert.equal(diagnosisNote('optimized 中的 STAR 改写对照 JD'), '建议表达 中的 经历 改写对照 岗位要求');
});

test('job actions lead with a concrete change while preserving complete evidence and conditions',()=>{
  const old = '【岗位建议】JD 要求网络开发，简历有 Web 项目，建议说明你独立负责的模块。';
  assert.deepEqual(jobSuggestion(old), {headline:'建议说明你独立负责的模块。', detail:'岗位要求网络开发，简历有 Web 项目，建议说明你独立负责的模块。'});
  const conditional = '【岗位建议】JD 要求 Redis，若实习中确实使用过 Stream，可补充消费组；没有做过就作为学习方向。';
  assert.equal(jobSuggestion(conditional).headline, '若实习中确实使用过 Stream，可补充消费组；没有做过就作为学习方向。');
  const leadingCondition = '若实际用过 Redis，可以补充缓存策略。';
  assert.equal(jobSuggestion(leadingCondition).headline, leadingCondition);
  assert.deepEqual(jobSuggestion('【岗位建议】写清 Web 项目中的个人分工\n简历只写了核心开发者，需要对应具体模块。'), {headline:'写清 Web 项目中的个人分工', detail:'简历只写了核心开发者，需要对应具体模块。'});
  assert.deepEqual(jobSuggestion('【岗位建议】<img>unknown'), {headline:'<img>暂未提供', detail:''});
});

test('matching survives navigation but changed pair and failed recalculation cannot restore stale score',async()=>{
  const workspace=createWorkspace();workspace.updateSelection({resumeId:'r',jdId:'j'});
  const result={resume_id:'r',jd_id:'j',score:50,matched_skills:['SQL'],missing_skills:['Python'],gap_analysis:['1/2'],is_mock:false};
  let fail=false,state;
  const api={async request(path){if(path==='/api/v1/matches'){if(fail)throw Error('failure');return {data:result};}if(path==='/api/v1/modules')return {data:{jobs:{is_mock:false}}};return {data:[{id:path.includes('resumes')?'r':'j'}]};}};
  const mount=()=>connectJobs({...workspace,api,signal:new AbortController().signal},s=>{state=s;});
  let controller=mount();await controller.match();controller.dispose();
  controller=mount();await controller.load();assert.equal(state.result.score,50);
  fail=true;await controller.match();assert.equal(state.result,null);controller.dispose();
  controller=mount();await controller.load();assert.equal(state.result,null);
  fail=false;await controller.match();controller.choose('jdId','other');assert.equal(workspace.getState().result,null);controller.dispose();
});
