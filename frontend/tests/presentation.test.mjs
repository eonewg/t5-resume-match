import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSuggestion,userText} from '../src/core/presentation.js';
import {connectJobs} from '../src/modules/jobs/controller.js';
import {createWorkspace} from '../src/core/workspace.js';
import {fieldStatus} from '../src/core/ui.js';

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
