import {connectDiagnosis} from './controller.js';
import {splitSuggestion,userText} from '../../core/presentation.js';
import {setFeedback,suggestionText} from '../../core/ui.js';

export function mount(container,context){
  const node=(tag,text='',className='')=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
  const heading=node('h1','简历优化');
  const intro=node('p','让真实经历表达得更清晰，更贴近目标岗位。','page-intro');
  const selection=node('p','','selected-context');selection.dataset.testid='diagnosis-selection';
  const back=node('a','选择简历与目标岗位');back.href='#matching';
  const mode=node('p','','helper-text');mode.dataset.testid='diagnosis-provider-mode';
  const run=node('button','生成优化建议','button primary');run.type='button';run.id='diagnosis-run';
  const actions=node('div','','inline-actions');actions.append(run,back);
  const status=node('p','','product-status feedback');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const results=node('section');results.dataset.testid='diagnosis-result';
  const empty=node('p','选择已保存的简历和目标岗位后，再生成针对性建议。','product-empty');
  const guidance=node('details','','helper-disclosure');guidance.append(node('summary','关于 AI 建议与事实核对'),node('p','建议由智能服务生成，不自动采用。原文、待补量化信息与待核实事实请逐项对照；复制后仍需人工核实。'));
  container.className='product-page diagnosis-page';container.replaceChildren(node('p','04 / 打磨表达','eyebrow'),heading,intro,selection,mode,actions,status,guidance,empty,results);
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
    status.textContent=userText(error||(busy?'AI 正在梳理经历与岗位重点，可能需要一两分钟。请稍候…':record?'建议已生成，请对照原文核实后使用。':''));setFeedback(status,{busy,error,success:Boolean(record)});
    run.className='button '+(record?'secondary':'primary');
    empty.hidden=Boolean(record)||busy;empty.textContent=error?'本次未生成建议，已保留当前选择。请重试。':canRun?'准备就绪，点击“生成优化建议”开始。':'先选择已保存的简历和目标岗位。';
    results.replaceChildren();results.hidden=!record;if(!record)return;
    const provenance=node('p',record.is_mock?'演示数据 · 仅用于体验':'真实结果 · 使用前请核实','status-badge');provenance.dataset.testid='diagnosis-result-mode';provenance.dataset.state=record.is_mock?'neutral':'success';
    const overview=node('section','','optimization-overview');overview.append(provenance,node('h2','总体建议'),node('p',record.summary,'optimization-summary'));results.append(overview);
    const targeted=node('ul','','suggestion-list');const other=node('ul','','suggestion-list');const comparisons=node('div');
    for(const text of record.suggestions){
      const parts=splitSuggestion(text);
      if(parts){
        const entry=node('article','','suggestion-entry');const comparison=node('div','','suggestion-compare');
        for(const [label,value]of [['原文',parts.original],['建议表达',parts.suggested]]){const section=node('section');const content=node('p');if(label==='建议表达')suggestionText(content,value);else content.textContent=value;section.append(node('h3',label),content);comparison.append(section);}
        const copy=node('button','复制建议','button secondary');copy.type='button';const copied=node('span','','copy-status');copied.setAttribute('role','status');
        copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(parts.suggested);if(!disposed)copied.textContent='已复制，请核实后在简历中修改。';}catch{if(!disposed)copied.textContent='复制未成功，请选择建议文字手动复制。';}});
        const reason=node('div','','suggestion-reason');reason.append(node('h3','为什么这样改'),node('p',parts.reason));
        const copyActions=node('div','','inline-actions');copyActions.append(copy,copied);
        entry.append(comparison,reason,copyActions);comparisons.append(entry);
      }else if(text.startsWith('【岗位建议】'))targeted.append(node('li',text.slice(6)));
      else other.append(node('li',text));
    }
    if(targeted.childElementCount)results.append(node('h2','针对目标岗位'),targeted);
    if(comparisons.childElementCount)results.append(node('h2','经历表达对照'),comparisons);
    if(other.childElementCount)results.append(node('h2','补充建议与核实提醒'),other);
    if(!record.suggestions.length)results.append(node('p','当前结果暂无具体建议。'));
    const edit=node('a','返回我的简历核对修改','button primary');edit.href='#resume';results.append(edit);
  });
  run.addEventListener('click',controller.run);
  context.api.modules().then(({data})=>{if(disposed||context.signal.aborted)return;const mock=data.diagnosis?.is_mock;mode.textContent=mock===true?'演示数据：当前使用演示服务。':mock===false?'生成建议时，将把所选简历与岗位内容发送给已配置的智能服务。':'服务状态暂未确认。';}).catch(()=>{if(!disposed&&!context.signal.aborted)mode.textContent='暂时无法读取服务状态，请刷新后重试。';});
  return()=>{disposed=true;selectionVersion++;controller.dispose();run.removeEventListener('click',controller.run);};
}
