// Real HTTP/UI flow. Diagnosis is an explicit fixture, never a model-quality claim.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8770';
const out = process.env.T5_SMOKE_OUT || '.verification/task-flow';
const fixtures = path.join(__dirname, 'fixtures');
const report = {widths: [1440,1280,390], checks: [], screens: [], model: 'explicit is_mock fixture; no paid API', status: 'running'};
fs.mkdirSync(out, {recursive:true});
async function shot(page,name) {
  await page.evaluate(()=>scrollTo(0,0)); const file=path.join(out,name+'.png');
  await page.screenshot({path:file,fullPage:true,animations:'disabled'}); report.screens.push(file);
}
async function layout(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no whole-page overflow');
  assert.equal(await page.locator('nav [aria-current=page]').count(),1);
  assert.ok(await page.locator('#module-view .button.primary:visible').count()<=1,'one primary per stage');
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const [index,width] of report.widths.entries()) {
   const page=await browser.newPage({viewport:{width,height:width===390?844:1000}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/#matching');
   await page.getByRole('heading',{name:'还没有匹配结果',exact:true}).waitFor();
   assert.equal(await page.locator('#module-view select:visible').count(),0);
   assert.equal(await page.locator('#module-view button:visible').count(),0);
   await layout(page);await shot(page,'matching-empty-'+width);
   await page.locator('[data-view=diagnosis]').click();
   await page.getByRole('heading',{name:'先选择简历和目标岗位',exact:true}).waitFor();
   assert.ok(!(await page.locator('#diagnosis-run').isVisible()));
   await layout(page);await shot(page,'diagnosis-empty-'+width);
   await page.locator('[data-view=resume]').click();await page.locator('#resume-dropzone:enabled').waitFor();
   assert.ok(!(await page.locator('.resume-fields').isVisible()));assert.ok(!(await page.locator('#resume-raw').isVisible()));
   assert.equal(await page.locator('#resume-history').getAttribute('open'),null);
   await layout(page);await shot(page,'resume-empty-'+width);
   const extension=['txt','docx','pdf'][index];
   let release,intercepted;const held=new Promise(resolve=>{intercepted=resolve;});
   await page.route('**/api/v1/resumes/upload-preview',async route=>{await new Promise(resolve=>{release=resolve;intercepted();});await route.continue();});
   const uploading=page.waitForResponse(r=>r.url().endsWith('/resumes/upload-preview'));
   await page.locator('#resume-file').setInputFiles(path.join(fixtures,'resume.'+extension));
   await held;await page.locator('#resume-status[data-state=busy]').waitFor();
   assert.match(await page.locator('#resume-status').innerText(),/正在读取并整理简历/);
   await shot(page,'upload-loading-'+width);release();
   const response=await uploading;assert.equal(response.status(),200);const preview=await response.json();
   await page.locator('.resume-fields:visible').waitFor();await page.locator('#resume-save:disabled').waitFor();
   // Native textareas display CRLF as LF; persistence below must retain exact extracted bytes as text.
   assert.equal(await page.locator('#resume-raw').inputValue(),preview.raw_text.replace(/\r\n?/g,'\n'));
   await page.unroute('**/api/v1/resumes/upload-preview');
   await page.locator('#resume-skills').fill('SQL');
   const confirmed='使用 SQL 汇总 120 条课程记录，整理结果。';
   if(!(await page.locator('#resume-experience-0').count()))await page.locator('#resume-add-experience').click();
   await page.locator('#resume-experience-0').fill(confirmed);await page.locator('#resume-reviewed').check();await layout(page);
   const saving=page.waitForResponse(r=>r.url().endsWith('/api/v1/resumes')&&r.request().method()==='POST');
   await page.locator('#resume-save').click();const saved=await(await saving).json();await page.locator('#resume-next:visible').waitFor();
   assert.equal(saved.raw_text,preview.raw_text);assert.deepEqual(saved.skills,['SQL']);
   assert.deepEqual(await(await page.request.get(base+'/api/v1/resumes/'+saved.id)).json(),saved);
   assert.equal(await page.locator('#resume-history button[data-resume-id="'+saved.id+'"]').count(),1);
   await layout(page);await shot(page,'resume-'+width);
   await page.locator('#resume-next').click();await page.locator('.current-resume strong').filter({hasText:saved.name||'我的简历'}).waitFor();
   assert.equal(await page.locator('#module-view select').count(),0);
   await page.locator('.job-form summary').click();await page.locator('#jobs-title').fill('流程验收岗位 '+width);
   await page.locator('#jobs-company').fill('合成验收公司');await page.locator('#jobs-text').fill('需要 SQL、Python 和 Docker。');await layout(page);
   const creating=page.waitForResponse(r=>r.url().endsWith('/api/v1/jobs')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'保存并选中',exact:true}).click();const job=await(await creating).json();
   await page.locator('#jobs-run:visible:enabled').waitFor();assert.equal(await page.locator('[data-job-id="'+job.id+'"]').getAttribute('aria-pressed'),'true');
   assert.ok(await page.locator('#jobs-run').evaluate(e=>e.getBoundingClientRect().bottom<innerHeight-60),'selected job next step stays in first viewport');
   await layout(page);await shot(page,'jobs-'+width);
   await page.locator('#jobs-run').click();await page.waitForURL('**/#matching');await page.locator('#jobs-result:visible').waitFor();
   assert.equal(await page.locator('#module-view select').count(),0);assert.match(await page.locator('.match-score').innerText(),/33.33%/);
   assert.deepEqual(await page.locator('.ability-grid section:first-child li').allTextContents(),['SQL']);
   assert.equal(await page.locator('.match-evidence').getAttribute('open'),null);await layout(page);await shot(page,'matching-'+width);
   let diagnosisCalls=0;
   await page.route('**/api/v1/diagnoses',async route=>{
    diagnosisCalls++;assert.deepEqual(route.request().postDataJSON(),{resume_id:saved.id,jd_id:job.id});
    await route.fulfill({status:201,json:{id:'flow-demo',resume_id:saved.id,jd_id:job.id,summary:'演示数据：请核实后使用建议。',is_mock:true,
     suggestions:['【岗位建议】如有真实 Docker 经历，可补充具体实践。',`【STAR】原文：${confirmed}\n优化：${confirmed}【待补充：具体成果】\n理由：保留原文事实。`,'<img src=x onerror=alert(1)>']}});
   });
   await page.locator('#matching-optimize').click();await page.waitForURL('**/#diagnosis');await page.locator('.suggestion-compare').waitFor();
   assert.equal(diagnosisCalls,1);assert.equal(await page.locator('#module-view select').count(),0);
   assert.equal(await page.locator('.suggestion-compare section:first-child p').innerText(),confirmed);
   assert.equal(await page.locator('.suggestion-compare mark').innerText(),'【待补充：具体成果】');
   assert.equal(await page.getByTestId('diagnosis-result').locator('img').count(),0);assert.match(await page.getByTestId('diagnosis-result-mode').innerText(),/演示数据/);
   await layout(page);await shot(page,'diagnosis-'+width);
   const failure=r=>r.fulfill({status:503,json:{error:{message:'模型服务暂不可用，请重试。'}}});
   await page.route('**/api/v1/diagnoses',failure);await page.locator('#diagnosis-run').click();await page.getByRole('button',{name:'重试生成建议',exact:true}).waitFor();
   assert.ok(!(await page.getByTestId('diagnosis-result').isVisible()));assert.equal(await page.locator('.suggestion-compare').count(),0);await shot(page,'diagnosis-error-'+width);
   await page.unroute('**/api/v1/diagnoses',failure);await page.locator('#diagnosis-run').click();await page.locator('.suggestion-compare').waitFor();assert.equal(diagnosisCalls,2);
   await page.locator('[data-view=matching]').click();await page.locator('#jobs-result:visible').waitFor();
   await page.locator('#matching-optimize').click();await page.locator('.suggestion-compare').waitFor();assert.equal(diagnosisCalls,2,'cached result avoids repeat generation');
   await page.locator('[data-view=analytics]').click();await page.locator('#analytics-metrics').waitFor();
   assert.ok(!(await page.locator('#analytics-source').isVisible()));assert.equal(await page.locator('.analytics-library').getAttribute('open'),null);
   assert.match(await page.locator('#analytics-scope').innerText(),/来源/);await layout(page);await shot(page,'analytics-'+width);
   await page.locator('#analytics-sources summary').click();const table=page.locator('#analytics-sources .analytics-table-scroll');
   assert.ok(await table.evaluate(e=>e.clientWidth<=innerWidth));if(width===390)assert.ok(await table.evaluate(e=>e.scrollWidth>e.clientWidth));
   await page.locator('#analytics-salary .helper-disclosure summary').click();assert.match(await page.locator('#analytics-salary').innerText(),/不以零薪资/);
   assert.deepEqual(errors,[]);report.checks.push(`${width}px: fresh empty states; ${extension.toUpperCase()} upload/loading/raw text; save/history auto-update; target auto-selection; match; optimization auto-start/cache/error/retry; XSS/provenance; analytics-first; contained scroll`);
   await page.close();
  }
  report.status='passed';
 } catch(error) {report.status='failed';report.error=error.stack;throw error;}
 finally {fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
