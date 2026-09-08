import {connectDiagnosis} from './controller.js';
import {splitSuggestion,userText} from '../../core/presentation.js';

export function mount(container,context){
  const node=(tag,text='',className='')=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
  const heading=node('h1','简历优化');
  const intro=node('p','围绕目标岗位，梳理经历的表达与重点。建议由智能服务生成，使用前请核实事实。','page-intro');
  const selection=node('p');selection.dataset.testid='diagnosis-selection';
  const back=node('a','选择简历与目标岗位');back.href='#matching';
  const mode=node('p','','product-status');mode.dataset.testid='diagnosis-provider-mode';
  const run=node('button','生成优化建议','button primary');run.type='button';run.id='diagnosis-run';
  const actions=node('div','','inline-actions');actions.append(run,back);
  const status=node('p','','product-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const results=node('section');results.dataset.testid='diagnosis-result';
  const empty=node('p','选择已保存的简历和目标岗位后，再生成针对性建议。','product-empty');
  container.className='product-page';container.replaceChildren(heading,intro,selection,mode,actions,status,empty,results);
  let disposed=false,selectionVersion=0,lastPair='';
  const controller=connectDiagnosis(context,({current,record,busy,error,canRun})=>{
    const pair=JSON.stringify([current.resumeId,current.jdId]);
    if(pair!==lastPair){
      lastPair=pair;const version=++selectionVersion;
      selection.textContent=canRun?'已选择简历与目标岗位，正在读取名称…':'尚未选择简历与目标岗位。';
      if(canRun)Promise.all([context.api.request('/api/v1/resumes/'+encodeURIComponent(current.resumeId)),context.api.request('/api/v1/jobs/'+encodeURIComponent(current.jdId))]).then(([resume,job])=>{
        if(!disposed&&!context.signal.aborted&&version===selectionVersion)selection.textContent=`${resume.data.name||'未命名简历'} · ${job.data.title}`;
      }).catch(()=>{if(!disposed&&!context.signal.aborted&&version===selectionVersion)selection.textContent='已选择简历与目标岗位，名称暂时无法读取。';});
    }
    run.disabled=busy||!canRun;run.textContent=busy?'正在生成建议…':error?'重试生成建议':record?'重新生成建议':'生成优化建议';
    status.textContent=userText(error||(busy?'正在整理建议，请稍候。内容较长时可能需要一两分钟。':''));status.dataset.error=String(Boolean(error));
    empty.hidden=Boolean(record)||busy;empty.textContent=error?'本次未生成建议，已保留当前选择。请重试。':canRun?'准备就绪，点击“生成优化建议”开始。':'先选择已保存的简历和目标岗位。';
    results.replaceChildren();results.hidden=!record;if(!record)return;
    const provenance=node('p',record.is_mock?'演示数据 · 仅用于体验，不代表真实优化结果':'优化建议 · 使用前请核实事实','product-status');provenance.dataset.testid='diagnosis-result-mode';
    results.append(provenance,node('h2','总体建议'),node('p',record.summary,'optimization-summary'));
    const targeted=node('ul','','suggestion-list');const other=node('ul','','suggestion-list');const comparisons=node('div');
    for(const text of record.suggestions){
      const parts=splitSuggestion(text);
      if(parts){
        const entry=node('article','','suggestion-entry');const comparison=node('div','','suggestion-compare');
        for(const [label,value]of [['原文',parts.original],['建议表达',parts.suggested]]){const section=node('section');section.append(node('h3',label),node('p',value));comparison.append(section);}
        const copy=node('button','复制建议','button secondary');copy.type='button';const copied=node('span','','copy-status');copied.setAttribute('role','status');
        copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(parts.suggested);if(!disposed)copied.textContent='已复制，请核实后在简历中修改。';}catch{if(!disposed)copied.textContent='复制未成功，请选择建议文字手动复制。';}});
        entry.append(comparison,node('p',parts.reason,'suggestion-reason'),copy,copied);comparisons.append(entry);
      }else if(text.startsWith('【岗位建议】'))targeted.append(node('li',text.slice(6)));
      else other.append(node('li',text));
    }
    if(targeted.childElementCount)results.append(node('h2','针对目标岗位'),targeted);
    if(comparisons.childElementCount)results.append(node('h2','经历表达对照'),comparisons);
    if(other.childElementCount)results.append(node('h2','补充建议与核实提醒'),other);
    if(!record.suggestions.length)results.append(node('p','当前结果暂无具体建议。'));
    const edit=node('a','返回我的简历核对修改','button secondary');edit.href='#resume';results.append(edit);
  });
  run.addEventListener('click',controller.run);
  context.api.modules().then(({data})=>{if(disposed||context.signal.aborted)return;const mock=data.diagnosis?.is_mock;mode.textContent=mock===true?'演示数据：当前使用演示服务。':mock===false?'生成建议时，将把所选简历与岗位内容发送给已配置的智能服务。':'服务状态暂未确认。';}).catch(()=>{if(!disposed&&!context.signal.aborted)mode.textContent='暂时无法读取服务状态，请刷新后重试。';});
  return()=>{disposed=true;selectionVersion++;controller.dispose();run.removeEventListener('click',controller.run);};
}
