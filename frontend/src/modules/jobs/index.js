import {connectJobs} from './controller.js';
import {userText} from '../../core/presentation.js';
import {renderChips,setFeedback} from '../../core/ui.js';
export function mount(container,context){
 const matching=context.view==='matching';
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./styles.css',import.meta.url).href;document.head.append(style);
 const node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
 const button=(text,primary=false)=>{const e=node('button',text,'button '+(primary?'primary':'secondary'));e.type='button';return e;};
 const link=(text,href,primary=false)=>{const e=node('a',text,'button '+(primary?'primary':'ghost'));e.href=href;return e;};
 const resume=node('section','','current-resume'),resumeInfo=node('div'),resumeName=node('strong'),resumeTime=node('span','','helper-text');resumeInfo.append(node('span','当前简历','eyebrow'),resumeName,resumeTime);resume.append(resumeInfo,link('更换简历','#resume'));
 const jobList=node('div','','job-options');jobList.setAttribute('aria-label','选择目标岗位');
 const form=node('form'),title=node('input'),company=node('input'),raw=node('textarea');title.id='jobs-title';title.maxLength=200;title.required=true;company.id='jobs-company';company.maxLength=200;raw.id='jobs-text';raw.maxLength=50000;raw.required=true;raw.rows=5;raw.placeholder='粘贴完整岗位职责与任职要求…';
 for(const [text,field]of [['岗位名称',title],['公司（选填）',company],['岗位要求原文',raw]]){const label=node('label',text);label.htmlFor=field.id;form.append(label,field);}
 const save=button('保存并选中',true);save.type='submit';form.append(save);const createPanel=node('details','','job-form');createPanel.append(node('summary','添加岗位'),form);
 const original=node('details','','job-original'),originalText=node('p'),source=node('p','','helper-text');originalText.id='jobs-original';original.append(node('summary','查看所选岗位要求'),originalText,source);
 const run=button('开始匹配',true);run.id='jobs-run';
 const mode=node('details','','helper-disclosure');mode.append(node('summary','演示模式'),node('p','岗位解析使用演示服务，匹配结果会明确标注是否为演示数据。'));mode.hidden=true;
 const status=node('p','','product-status feedback');status.id='jobs-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const retry=button('重试加载');retry.className='button ghost';retry.hidden=true;
 const empty=node('div','','product-empty'),results=node('section','','match-result');results.id='jobs-result';results.hidden=true;
 const selected=node('section','','selected-job');selected.dataset.testid='selected-job';
 const selectedTitle=node('h2'),selectedCompany=node('p','','helper-text'),selectedSkills=node('div','','chips');selected.append(node('span','当前目标岗位','eyebrow'),selectedTitle,selectedCompany,selectedSkills);
 const picker=node('details','','job-picker');picker.append(node('summary','更换目标岗位'));
 const listHost=node('div');const choiceHeading=node('h2','选择目标岗位');
 const choices=node('section');choices.append(choiceHeading,selected,run,createPanel,picker,listHost,original);
 container.className='product-page '+(matching?'matching-page':'jobs-page');container.replaceChildren(node('p',matching?'03 / 看清差距':'02 / 找准方向','eyebrow'),node('h1',matching?'匹配分析':'目标岗位'),node('p',matching?'看清已经体现的能力，找到下一步补充的重点。':'选择你想申请的岗位，看看经历与要求的契合程度。','page-intro'));if(!matching)container.append(resume,choices);container.append(status,retry,empty,results,mode);
 let current,operation='load';
 const controller=connectJobs(context,state=>{
  current=state;retry.hidden=!state.error||operation!=='load';retry.disabled=state.busy;for(const field of [save,run])field.disabled=state.busy;for(const field of [title,company,raw])field.readOnly=state.busy;
  mode.hidden=matching||state.jobMock!==true;const busyText={load:'正在读取简历与岗位…',create:'正在整理岗位要求并保存…',match:'正在对照简历与岗位技能…'}[operation];status.textContent=userText(state.error||(state.busy?busyText:state.notice));status.hidden=!status.textContent;setFeedback(status,{busy:state.busy,error:state.error});
  run.textContent=state.busy&&operation==='match'?'正在匹配…':state.error&&operation==='match'?'重试匹配':'开始匹配';run.hidden=!state.resumeId||!state.jdId||createPanel.open;save.textContent=state.busy&&operation==='create'?'正在整理并保存…':'保存并选中';
  const currentResume=state.resumes.find(x=>x.id===state.resumeId);resume.hidden=!state.resumeId;choices.hidden=!state.resumeId;resumeName.textContent=currentResume?.name||'我的简历';const time=currentResume?.updated_at||currentResume?.created_at;resumeTime.textContent=time?'最后更新：'+new Date(time).toLocaleString('zh-CN'):'';
  const job=state.jobs.find(x=>x.id===state.jdId);
  selected.hidden=!job;choiceHeading.hidden=Boolean(job);picker.hidden=!job;listHost.hidden=Boolean(job);
  selectedTitle.textContent=job?.title||'';selectedCompany.textContent=job?.company||'公司暂未提供';renderChips(selectedSkills,(job?.skills||[]).slice(0,5));
  if(job)picker.append(jobList);else listHost.append(jobList);
  jobList.replaceChildren();for(const row of state.jobs){const option=button('');option.className='job-option';option.dataset.jobId=row.id;option.setAttribute('aria-pressed',String(row.id===state.jdId));option.disabled=state.busy;option.append(node('strong',row.title),node('span',row.company||'公司暂未提供','helper-text'));const chips=node('div','','chips');renderChips(chips,(row.skills||[]).slice(0,5));option.append(chips);option.addEventListener('click',()=>{controller.choose('jdId',row.id);picker.open=false;});jobList.append(option);}if(!state.jobs.length&&!state.busy)jobList.append(node('p','还没有目标岗位。展开“添加岗位”，粘贴你想申请的岗位要求。','helper-text'));
  original.hidden=!job;originalText.textContent=job?.jd_text||'';source.textContent='来源：'+(job?.source_name||({real:'真实采样',course:'课程样本',synthetic:'演示数据'}[job?.source_type])||'暂未提供');if(job?.source_url){try{const url=new URL(job.source_url);if(['http:','https:'].includes(url.protocol)){const a=link('查看来源',url.href);a.target='_blank';a.rel='noopener noreferrer';source.append(a);}}catch{/* Untrusted URLs stay text-only. */}}
  empty.replaceChildren();empty.hidden=state.busy||(!matching&&Boolean(state.resumeId))||(matching&&Boolean(state.result));if(matching)empty.append(node('h2','还没有匹配结果'),node('p','选择一份简历和目标岗位后，即可查看匹配度和能力差距。'),link('选择目标岗位','#jobs',true));else empty.append(node('h2','先导入一份简历'),node('p','核对并保存后，就可以选择目标岗位。'),link('导入简历','#resume',true));
  results.replaceChildren();results.hidden=!matching||!state.result;if(!matching||!state.result)return;const r=state.result,assessed=r.matched_skills.length+r.missing_skills.length>0||r.score>0;const hero=node('div','','match-hero'),score=node('div'),target=node('div','','match-target');score.append(node('h2','匹配度'),node('p',r.is_mock?'— · 演示数据':assessed?`${r.score}%`:'暂无法评估','match-score'));target.append(node('h3',job?.title||'已选择岗位'),node('p',job?.company||'公司暂未提供'));hero.append(score,target);results.append(hero);
  const abilities=node('div','','ability-grid');for(const [label,values,tone]of [['已匹配能力',r.matched_skills,'matched'],['待补能力',r.missing_skills,'missing']]){const section=node('section','',tone);section.append(node('h3',label));const list=node('ul','','skill-list');for(const value of values.length?values:['暂无'])list.append(node('li',value,values.length?'chip':'helper-text'));section.append(list);abilities.append(section);}results.append(abilities,node('p','该分数表示关键词/能力覆盖情况，不代表录用概率。','helper-text'));
  const evidence=node('details','','match-evidence');evidence.append(node('summary','为什么是这个分数？'),node('p','待补能力是简历尚未直接体现的内容，不代表你不具备。请依据真实经历补充。','helper-text'));const list=node('ul');for(const value of r.gap_analysis)list.append(node('li',value));evidence.append(list);results.append(evidence);
  const optimize=link('优化这份简历','#diagnosis',true);optimize.id='matching-optimize';optimize.addEventListener('click',()=>context.updateSelection({result:{...context.getState().result,diagnosisRequested:true}}));results.append(optimize);
 });
 retry.addEventListener('click',()=>{operation='load';controller.load();});
 createPanel.addEventListener('toggle',()=>{run.hidden=createPanel.open||!current?.resumeId||!current?.jdId;});form.addEventListener('submit',async event=>{event.preventDefault();operation='create';await controller.create({title:title.value,company:company.value||null,jd_text:raw.value});if(!current.error&&!context.signal.aborted){createPanel.open=false;picker.open=false;form.reset();}});run.addEventListener('click',async()=>{operation='match';await controller.match();if(current.result&&!context.signal.aborted)location.hash='matching';});controller.load();return()=>{controller.dispose();style.remove();};
}
