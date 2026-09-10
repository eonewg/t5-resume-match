// Desktop layout + long-output acceptance; explicit offline fixtures, no model requests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {widths,height}=require('./viewports.cjs');
const base=process.env.T5_SMOKE_URL;
const out=process.env.T5_DESKTOP_OUT;
fs.mkdirSync(out,{recursive:true});
const report={kind:'desktop UI; offline AI fixtures',sizes:[],status:'running'};
async function shot(page,name) {
 await page.evaluate(()=>scrollTo(0,0));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');
 await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});
}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});
try {for(const width of widths){
 const page=await browser.newPage({viewport:{width,height:height(width)}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const experiences=Array.from({length:5},(_,i)=>`项目 ${i+1}：使用 Python 与 SQL 整理课程记录，完成数据清理与汇总，并向同学说明结果。负责从原始文件到结果校验的完整流程，保留统计口径与复核记录。`);
 const resume=await(await page.request.post(base+'/api/v1/resumes',{data:{raw_text:'姓名：桌面验收\n技能：Python、SQL\n'+experiences.join('\n'),name:'桌面验收 '+width,education:'计算机科学与技术 · 本科',skills:['Python','SQL','Git'],experience:experiences}})).json();
 const job=await(await page.request.post(base+'/api/v1/jobs',{data:{title:'数据分析工程师 '+width,company:'合成验收公司',jd_text:'Python SQL 数据分析 可视化',source_type:'synthetic'}})).json();
 await page.goto(base);await page.locator('#home-next').waitFor();await shot(page,'home-'+width);
 const next=await page.locator('#home-next').boundingBox();assert.ok(next.y+next.height<height(width),'next action in initial viewport');
 await page.locator('[data-view=resume]').click();await page.locator('#resume-dropzone:enabled').waitFor();await shot(page,'resume-empty-'+width);
 await page.locator('#resume-history summary').click();await page.locator(`[data-resume-id="${resume.id}"]`).click();await page.locator('#resume-next').waitFor();
 await page.evaluate(()=>scrollTo(0,0)); const left=await page.locator('.resume-import').boundingBox(),right=await page.locator('.resume-fields').boundingBox();
 assert.ok(Math.abs(left.y-right.y)<2,'columns align at top');assert.ok(left.x+left.width<right.x,'stable two columns');
 await shot(page,'resume-review-'+width);
 await page.evaluate(()=>scrollTo(0,500));const stuck=await page.locator('.resume-import').boundingBox();assert.ok(stuck.y>=19,'source remains available while editing long forms');
 await page.locator('#resume-next').click();await page.locator(`[data-job-id="${job.id}"]`).click();await shot(page,'jobs-'+width);
 await page.route('**/api/v1/matches',route=>route.fulfill({status:201,json:{id:'desktop-match',resume_id:resume.id,jd_id:job.id,is_mock:false,score:66.67,matched_skills:['Python','SQL'],missing_skills:['数据可视化'],gap_analysis:Array.from({length:8},(_,i)=>`依据 ${i+1}：简历已体现课程数据整理，可结合真实项目补充分析方法与结果说明。`)}}));
 await page.locator('#jobs-run').click();await page.locator('#jobs-result').waitFor();assert.equal(await page.locator('#gap-analysis > li').count(),3);assert.equal(await page.locator('.more-evidence').getAttribute('open'),null);
 await shot(page,'matching-'+width);await page.locator('.more-evidence summary').click();assert.equal(await page.locator('.more-evidence li:visible').count(),5);
 const suggestions=[...Array.from({length:7},(_,i)=>`【岗位建议】补充项目 ${i+1} 的数据分析应用。请说明实际使用的工具与分析步骤，保留真实结果，避免只罗列技术名词。`),...Array.from({length:7},(_,i)=>`【STAR】原文：${experiences[i%5]}\n优化：使用 Python 与 SQL 整理课程数据，执行清理、汇总与结果校验，并输出可复核的分析说明。【待补充：实际数据量与用途】\n理由：明确个人承担的任务与交付物，便于判断技能在项目中的实际应用。`),'【提醒】请核实所有项目事实，不补造数字。'];
 await page.route('**/api/v1/diagnoses',route=>route.fulfill({status:201,json:{id:'desktop-diagnosis',resume_id:resume.id,jd_id:job.id,is_mock:true,summary:'优先补充分析过程与交付结果，让工具能力有具体项目支撑。其余表述可在完成事实核对后逐项精简。',suggestions}}));
 await page.locator('#matching-optimize').click();await page.locator('.priority-list').waitFor();
 assert.equal(await page.locator('.priority-list li').count(),3);assert.equal(await page.locator('.suggestion-entry:visible').count(),2);
 assert.equal(await page.locator('.other-suggestions').getAttribute('open'),null);await shot(page,'diagnosis-'+width);
 await page.locator('.additional-experiences > summary').click();assert.equal(await page.locator('.suggestion-entry:visible').count(),7);
 await page.locator('.other-suggestions > summary').click();assert.equal(await page.locator('.other-suggestions li:visible').count(),8);
 await page.locator('[data-view=resume]').click();await page.locator('#resume-next').waitFor();await page.locator('.resume-draft-tools > summary').click();
 page.once('dialog',d=>d.dismiss());await page.locator('#resume-clear-fields').click();assert.equal(await page.locator('#resume-name').inputValue(),resume.name);
 page.once('dialog',d=>d.accept());await page.locator('#resume-clear-fields').click();assert.equal(await page.locator('#resume-name').inputValue(),'');assert.equal(await page.locator('#resume-raw').inputValue(),resume.raw_text);
 assert.deepEqual(await(await page.request.get(base+'/api/v1/resumes/'+resume.id)).json(),resume,'clear never deletes saved version');
 await page.locator('#resume-parse').click();await page.locator('#resume-parse:enabled').waitFor();await page.locator('#resume-reviewed').check();await page.locator('#resume-save-next').click();await page.locator('[data-module=jobs]').waitFor();
 assert.deepEqual(errors,[]);report.sizes.push({width,height:height(width),alignedColumns:true,stickySource:true,folding:true,safeClear:true,saveContinue:true});await page.close();
}report.status='passed';}catch(error){report.status='failed';report.error=error.stack;throw error;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}})().catch(error=>{console.error(error);process.exitCode=1;});
