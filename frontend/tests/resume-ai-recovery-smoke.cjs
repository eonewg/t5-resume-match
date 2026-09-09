// Offline browser acceptance of the AI failure path; no model-quality claim.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.T5_SMOKE_URL||'http://127.0.0.1:8770';
const out=process.env.T5_RESUME_RECOVERY_OUT||'.verification/resume-ai-recovery';
const raw=fs.readFileSync('tests/resume/fixtures/stefano-user.txt','utf8');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const report={kind:'offline AI failure fixture; no external model call',widths:[],status:'running'};
 try {
  for(const width of [1440,390]) {
   const page=await browser.newPage({viewport:{width,height:width===390?844:1000}});
   let uploadCalls=0,retries=0;
   await page.route('**/api/v1/resumes/upload-preview',route=>{uploadCalls++;return route.fulfill({status:504,json:{error:{code:'504',message:{code:'timeout',message:'AI 简历识别超时，请重试或手动填写。',raw_text:raw}}}});});
   await page.route('**/api/v1/resumes/preview',route=>{retries++;assert.equal(route.request().postDataJSON().raw_text,raw);return route.fulfill({status:503,json:{error:{message:{code:'rate_limit',message:'AI 简历识别服务繁忙，请稍后重试或手动填写。'}}}});});
   await page.goto(base+'/#resume');
   await page.locator('#resume-dropzone:enabled').waitFor();
   await page.locator('#resume-file').setInputFiles('tests/resume/fixtures/stefano-user.txt');
   await page.locator('#resume-ai-retry:visible').waitFor();
   assert.equal(await page.locator('#resume-raw').inputValue(),raw);
   assert.match(await page.locator('#resume-status').innerText(),/AI 暂时无法识别/);
   assert.ok(!(await page.locator('.resume-fields').isVisible()));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,`failure-${width}.png`),fullPage:true});
   await page.locator('#resume-ai-retry').click();
   await page.locator('#resume-status').filter({hasText:'繁忙'}).waitFor();
   assert.equal(retries,1);assert.equal(uploadCalls,1);
   assert.equal(await page.locator('#resume-raw').inputValue(),raw);
   await page.locator('#resume-manual').click();
   await page.locator('#resume-name').fill('斯特凡诺 (Stefano)');
   await page.locator('#resume-education').fill('某重点大学 计算机科学与技术 工学学士');
   await page.locator('#resume-skills').fill('Python\nSQL');
   await page.locator('#resume-reviewed').check();
   const saved=page.waitForResponse(r=>r.url().endsWith('/api/v1/resumes')&&r.request().method()==='POST');
   await page.locator('#resume-save').click();
   const result=await(await saved).json();
   await page.locator('#resume-next:visible').waitFor();
   assert.equal(result.raw_text,raw);assert.deepEqual(result.skills,['Python','SQL']);
   assert.equal(result.name,'斯特凡诺 (Stefano)');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,`manual-saved-${width}.png`),fullPage:true});
   report.widths.push({width,rawLength:raw.length,uploadCalls,retries,manualSaved:true,rawPreserved:true});
   await page.close();
  }
  report.status='passed';
 } catch(e){report.status='failed';report.error=e.message;throw e;}
 finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})().catch(e=>{console.error(e);process.exitCode=1;});
