import {connectJobs} from './controller.js';
import {userText} from '../../core/presentation.js';
import {renderChips, setFeedback} from '../../core/ui.js';

export function mount(container, context) {
  const matching = context.view === 'matching';
  const node = (tag,text='',className='') => {const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
  const button = (text,primary=false) => {const e=node('button',text,'button '+(primary?'primary':'secondary'));e.type='button';return e;};
  const link = (text,href) => {const e=node('a',text,'button secondary');e.href=href;return e;};
  const resume=node('select');resume.id='jobs-resume';
  const jobs=node('select');jobs.id='jobs-select';
  const selections=node('div','','selection-row');
  for(const [text,field] of [['我的简历',resume],['目标岗位',jobs]]){const group=node('div');const label=node('label',text);label.htmlFor=field.id;group.append(label,field);selections.append(group);}
  const refresh=button('刷新记录');refresh.className='button ghost';
  const title=node('input');title.id='jobs-title';title.maxLength=200;title.required=true;
  const company=node('input');company.id='jobs-company';company.maxLength=200;
  const raw=node('textarea');raw.id='jobs-text';raw.maxLength=50000;raw.required=true;raw.rows=5;raw.placeholder='粘贴完整岗位职责与任职要求…';
  const form=node('form');
  for(const [text,field] of [['岗位名称',title],['公司（选填）',company],['岗位要求原文',raw]]){const label=node('label',text);label.htmlFor=field.id;form.append(label,field);}
  const save=button('整理并保存岗位',true);save.type='submit';form.append(save);
  const createPanel=node('details','','job-form');createPanel.append(node('summary','添加目标岗位'),form);
  const detail=node('section','','job-detail');
  const jobTitle=node('h2');const companyText=node('p','','job-company');
  const parsed=node('div','','chips');parsed.id='jobs-keywords';const tools=node('div','','chips');tools.id='jobs-tools';const salary=node('p','','job-salary');salary.id='jobs-salary';
  parsed.setAttribute('aria-label','技能要求');tools.setAttribute('aria-label','常用工具');
  const source=node('p','','helper-text');source.id='jobs-source';
  const original=node('details');original.append(node('summary','查看完整岗位要求'));const originalText=node('p');originalText.id='jobs-original';original.append(originalText);
  const run=button(matching?'开始匹配分析':'分析与我的匹配度',true);run.id='jobs-run';
  const requirements=node('div','','job-requirements');
  for(const [label,content] of [['技能要求',parsed],['常用工具',tools]]){const section=node('section');section.append(node('h3',label),content);requirements.append(section);}
  detail.append(node('span','当前目标','status-badge'),jobTitle,companyText,salary,requirements,original,source);
  const actions=node('div','','inline-actions');actions.append(run,refresh,link('编辑我的简历','#resume'));
  const openMatch=link('查看匹配结果','#matching');openMatch.className='button primary';openMatch.hidden=true;
  if(!matching)actions.prepend(openMatch);
  const mode=node('p','','status-badge');mode.id='jobs-mode';
  const status=node('p','','product-status feedback');status.id='jobs-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const empty=node('div','','product-empty');empty.append(node('h2','先选择简历和目标岗位'),node('p','保存真实经历和完整岗位要求后，即可查看能力匹配情况。'));
  const results=node('section','','match-result');results.id='jobs-result';results.hidden=true;
  container.className='product-page '+(matching?'matching-page':'jobs-page');
  container.replaceChildren(node('p',matching?'03 / 看清差距':'02 / 找准方向','eyebrow'),node('h1',matching?'匹配分析':'目标岗位'),node('p',matching?'看清已经体现的能力，找到下一步补充的重点。':'保存值得准备的岗位，让每次匹配都有具体目标。','page-intro'),mode,selections);
  if(!matching) container.append(detail,createPanel);
  else {const change=link('查看或添加目标岗位','#jobs');container.append(change);}
  container.append(actions,status,empty,results);
  let current, operation='load';
  function options(select,rows,value,label){const option=node('option',label);option.value='';select.replaceChildren(option);for(const row of rows){const item=node('option',row.title||row.name||'未命名简历');item.value=row.id;select.append(item);}select.value=value;}
  const controller=connectJobs(context,state=>{
    current=state;
    options(jobs,state.jobs,state.jdId,'选择已保存岗位');options(resume,state.resumes,state.resumeId,'选择已保存简历');
    for(const field of [save,refresh,run,resume,jobs])field.disabled=state.busy;
    for(const field of [title,company,raw])field.readOnly=state.busy;
    mode.textContent=state.jobMock===true?'演示数据：岗位解析与匹配结果仅供体验。':'';mode.hidden=!mode.textContent;
    const busyText={load:'正在读取已保存的简历与岗位…',create:'正在整理岗位要求并保存…',match:'正在对照简历与岗位技能…'}[operation];
    status.textContent=userText(state.error||(state.busy?busyText:state.notice));setFeedback(status,{busy:state.busy,error:state.error,success:Boolean(state.result)});
    run.textContent=state.busy&&operation==='match'?'正在匹配…':state.error?'重试匹配分析':state.result?'重新匹配分析':matching?'开始匹配分析':'分析与我的匹配度';
    save.textContent=state.busy&&operation==='create'?'正在整理并保存…':'整理并保存岗位';
    run.className='button '+(state.result||(!matching&&createPanel.open)?'secondary':'primary');
    openMatch.hidden=!state.result;
    const job=state.jobs.find(x=>x.id===state.jdId);detail.hidden=!job;
    jobTitle.textContent=job?.title||'';companyText.textContent=job?.company||'公司暂未提供';
    renderChips(parsed,job?.skills||[]);renderChips(tools,job?.tools||[]);
    const periods={hour:'小时',day:'日',month:'月',year:'年'};
    const range=job?.salary_min!=null&&job?.salary_max!=null?`${job.salary_min}–${job.salary_max} ${job.currency||'币种暂未提供'} / ${periods[job.salary_period]||'周期暂未提供'}`:'';
    salary.textContent='薪资：'+(job?.salary||range||'暂未提供');source.textContent='来源：'+(job?.source_name||({real:'真实采样',course:'课程样本',synthetic:'演示数据'}[job?.source_type])||'暂未提供')+(job?.collected_at?' · 采集于 '+job.collected_at:'');
    if(job?.source_url){try{const url=new URL(job.source_url);if(['http:','https:'].includes(url.protocol)){const sourceLink=node('a',' 查看来源');sourceLink.href=url.href;sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';source.append(sourceLink);}}catch{/* Invalid source URL remains text-only metadata. */}}
    originalText.textContent=job?.jd_text||'';
    empty.hidden=Boolean(state.resumeId&&state.jdId)||state.busy;results.replaceChildren();results.hidden=!state.result;
    if(!state.result)return;
    if(matching)container.insertBefore(results,selections);
    const r=state.result;const assessed=r.matched_skills.length+r.missing_skills.length>0||r.score>0;
    const scoreHero=node('div','','match-hero');const scoreBlock=node('div');
    scoreBlock.append(node('h2','综合匹配度'),node('p',r.is_mock?'— · 演示数据':assessed?`${r.score}%`:'暂无法评估','match-score'),node('p','匹配分数不是录用概率','helper-text'));
    const target=node('div','','match-target');target.append(node('p','本次匹配目标','eyebrow'),node('h3',job?.title||'已选择岗位'),node('p',job?.company||'公司暂未提供'));
    const resultMode=node('span',r.is_mock?'演示数据':'真实结果','status-badge');resultMode.dataset.state=r.is_mock?'neutral':'success';target.append(resultMode);
    scoreHero.append(scoreBlock,target);results.append(scoreHero);
    const abilities=node('div','','ability-grid');
    for(const [label,values,tone]of [['已匹配能力',r.matched_skills,'matched'],['待补能力',r.missing_skills,'missing']]){const section=node('section','',tone);section.append(node('h3',label));const list=node('ul','','skill-list');for(const value of values.length?values:['暂无'])list.append(node('li',value,values.length?'chip':'helper-text'));section.append(list);abilities.append(section);}
    results.append(abilities,node('p','待补能力是简历尚未直接体现的内容，不代表你不具备。请依据真实经历补充。','helper-text'),link('优化这份简历','#diagnosis'));
    results.lastChild.className='button primary';
    const evidence=node('details','','match-evidence');evidence.append(node('summary','查看匹配依据'));const list=node('ul');for(const value of r.gap_analysis)list.append(node('li',value));evidence.append(list);results.append(evidence);
  });
  createPanel.addEventListener('toggle',()=>{run.className='button '+(createPanel.open||current?.result?'secondary':'primary');});
  form.addEventListener('submit',event=>{event.preventDefault();operation='create';controller.create({title:title.value,company:company.value||null,jd_text:raw.value});});
  resume.addEventListener('change',()=>controller.choose('resumeId',resume.value));jobs.addEventListener('change',()=>controller.choose('jdId',jobs.value));
  refresh.addEventListener('click',()=>{operation='load';controller.load();});
  run.addEventListener('click',async()=>{operation='match';await controller.match();if(!matching&&current.result&&!context.signal.aborted)location.hash='matching';});
  controller.load();
  return ()=>controller.dispose();
}
