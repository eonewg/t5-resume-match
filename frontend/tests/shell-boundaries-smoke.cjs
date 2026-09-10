const viewports = require('./viewports.cjs');
// Dashboard/router/clipboard/Mock/analytics acceptance; AI output is an explicit fixture.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8770';
const out = process.env.T5_SHELL_OUT || '.verification/react-shell';
fs.mkdirSync(out, {recursive:true});
const report = {widths:[],kind:'offline integration; explicit Mock AI output',status:'running'};
async function shot(page,name) {
  await page.evaluate(()=>scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no document overflow');
  assert.equal(await page.locator('nav [aria-current=page]').count(),1, page.url());
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  for (const width of viewports.widths) {
   const context=await browser.newContext({viewport:{width,height:viewports.height(width)},permissions:['clipboard-read','clipboard-write']});
   const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
   const resumeBody={raw_text:'  合成验收原文\r\nSQL  ',name:'React 流程 '+width,education:'本科',skills:['SQL'],experience:['整理 120 条课程记录。']};
   const saved=await(await page.request.post(base+'/api/v1/resumes',{data:resumeBody})).json();
   const job=await(await page.request.post(base+'/api/v1/jobs',{data:{title:'React 目标 '+width,company:'合成验收',jd_text:'SQL Python',source_type:'synthetic',collected_at:'2026-09-09',salary:'1000–2000 CNY/month',salary_min:1000,salary_max:2000,currency:'CNY',salary_period:'month'}})).json();
   await page.request.post(base+'/api/v1/jobs',{data:{title:'分组薪资 '+width,jd_text:'SQL',source_type:'synthetic',collected_at:'2026-09-09',salary_min:15,salary_max:20,currency:'EUR',salary_period:'hour'}});
   await page.goto(base);await page.locator('#home-next').waitFor();
   assert.match(await page.locator('#home-next').innerText(),/从导入简历开始/);
   assert.equal(await page.locator('.workflow-steps li').count(),4);
   await page.waitForFunction(() => { const image = document.querySelector('.brand-mark'); return image?.complete && image.naturalWidth > 0; });
   const favicon = await page.locator('link[rel=icon]').getAttribute('href');
   const iconResponse = await page.request.get(new URL(favicon, base).href);
   assert.equal(iconResponse.status(), 200);
   assert.match(iconResponse.headers()['content-type'], /image\/svg\+xml/);
   assert.ok(await page.locator('[data-view=analytics]').isVisible());await shot(page,'home-empty-'+width);
   await page.locator('#home-next').click();await page.locator('#resume-dropzone:enabled').waitFor();
   await page.locator('[data-view="resume/history"]').click();await page.locator('.history-version-list > li').filter({hasText:resumeBody.name}).getByRole('button',{name:'打开简历 →',exact:true}).click();await page.locator('#resume-next').waitFor();
   await page.locator('[data-view=home]').click();await page.locator('#home-next').filter({hasText:'继续选择目标岗位'}).waitFor();await shot(page,'home-resume-'+width);
   await page.locator('#home-next').click();await page.locator(`[data-job-id="${job.id}"]`).click();
   await page.locator('[data-view=home]').click();await page.locator('#home-next').filter({hasText:'查看匹配分析'}).waitFor();await page.locator('#home-next').click();
   await page.locator('#jobs-run:enabled').waitFor();
   const fail=route=>route.fulfill({status:503,json:{error:{message:'匹配服务暂不可用'}}});
   await page.route('**/api/v1/matches',fail);await page.locator('#jobs-run').click();await page.locator('#jobs-status[data-state=error]').waitFor();
   assert.equal(await page.locator('#jobs-result').count(),0);await page.unroute('**/api/v1/matches',fail);
   await page.getByRole('button',{name:'重试匹配',exact:true}).click();await page.locator('#jobs-result').waitFor();assert.match(await page.locator('#match-score').innerText(),/50/);
   // Header-only Mock provenance must still hide any numeric score.
   const mock=route=>route.fulfill({status:201,headers:{'X-T5-Mock':'true'},json:{id:'mock',resume_id:saved.id,jd_id:job.id,score:88,is_mock:false,matched_skills:['SQL'],missing_skills:['Python'],gap_analysis:['演示结果']}});
   await page.route('**/api/v1/matches',mock);await page.getByRole('button',{name:'重新匹配',exact:true}).click();await page.locator('#score-caption').filter({hasText:'Mock'}).waitFor();assert.equal(await page.locator('#match-score').innerText(),'—');await shot(page,'matching-mock-'+width);
   await page.unroute('**/api/v1/matches',mock);await page.getByRole('button',{name:'重新匹配',exact:true}).click();await page.locator('#match-score').filter({hasText:'50'}).waitFor();
   await page.locator('[data-view=home]').click();await page.locator('#home-next').filter({hasText:'针对岗位优化简历'}).waitFor();await shot(page,'home-match-'+width);
   let generated=0;const suggested='整理 120 条课程记录。【待补充：实际用途】';
   await page.route('**/api/v1/diagnoses',route=>{generated++;return route.fulfill({status:201,json:{id:'diagnosis-fixture',resume_id:saved.id,jd_id:job.id,is_mock:true,summary:'合成验收建议，需人工核实。',suggestions:[`【STAR】原文：整理 120 条课程记录。\n优化：${suggested}\n理由：保留事实与数字。`]}});});
   await page.locator('#home-next').click();await page.locator('#diagnosis-run:enabled').waitFor();assert.equal(generated,0,'normal page navigation never calls AI');
   await page.locator('#diagnosis-run').click();await page.locator('.suggestion-compare').waitFor();
   assert.deepEqual(await(await page.request.get(base+'/api/v1/resumes/'+saved.id)).json(),saved,'AI never overwrites originals');
   await page.locator('[data-view=home]').click();await page.locator('#home-next').filter({hasText:'查看建议并核实修改'}).waitFor();await shot(page,'home-diagnosed-'+width);
   await page.goBack();await page.locator('.suggestion-compare').waitFor();assert.equal(generated,1,'back/forward keeps current result');
   await page.locator('[data-view=analytics]').click();await page.locator('#analytics-metrics').waitFor();await page.locator('#analytics-filters summary').click();await page.locator('#analytics-source').selectOption('synthetic');await page.getByRole('button',{name:'应用筛选',exact:true}).click();await page.getByRole('tab',{name:'薪资分析'}).click();await page.getByRole('combobox',{name:'查看哪类薪资'}).selectOption('CNY/month');await page.locator('.salary-range-details > summary').click();await page.locator('[data-currency=CNY][data-period=month]').waitFor();await page.getByRole('combobox',{name:'查看哪类薪资'}).selectOption('EUR/hour');await page.locator('.salary-range-details > summary').click();await page.locator('[data-currency=EUR][data-period=hour]').waitFor();
   assert.equal(await page.locator('.analytics-salary-range').count(),0);await page.locator('.salary-detail-list input[type=checkbox]').first().check();assert.equal(await page.locator('.analytics-salary-range').count(),1);await shot(page,'analytics-groups-'+width);
   assert.equal(await page.locator('.analytics-library').count(),0);await page.route('**/api/v1/analytics/external-jobs*',route=>route.fulfill({status:200,json:{created:0,existing:5,skipped:0,cached:true,fetched_at:'2026-09-10T00:00:00Z'}}));await page.locator('#analytics-external-import').click();await page.locator('#analytics-status').filter({hasText:'已有 5 条'}).waitFor();assert.equal(await page.locator('#analytics-source').inputValue(),'real');
   assert.deepEqual(errors,[]);report.widths.push({width,home:'all 5 states',navigation:'legacy hash and history',mockHeader:true,matchRecovery:true,salaryGroups:true,externalSyncFixture:true});await context.close();
  }
  report.status='passed';
 }catch(error){report.status='failed';report.error=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
