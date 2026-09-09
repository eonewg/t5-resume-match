// Upload/review/history and presentation boundaries against the isolated QA server.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.T5_SMOKE_URL||'http://127.0.0.1:8770';
const out=process.env.T5_POLISH_OUT||'.verification/task-flow-boundaries';
fs.mkdirSync(out,{recursive:true});
const report={widths:[1440,1280,390],checks:[],status:'running'};
const raw='姓名：边界验收\n教育背景：本科\n技能：Python、SQL\n项目经历：使用 Python 整理课程数据。';
async function shot(page,name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/'+name+'.png',fullPage:true,animations:'disabled'});}
async function saved(page){const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/resumes')&&r.request().method()==='POST');await page.locator('#resume-reviewed').check();await page.locator('#resume-save').click();const value=await(await response).json();await page.locator('#resume-next:visible').waitFor();return value;}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of report.widths){
   const page=await browser.newPage({viewport:{width,height:width===390?844:1000}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/v1/resumes?*',route=>route.abort());await page.goto(base);await page.locator('#resume-status[data-state=error]').waitFor();
   await page.locator('#resume-history summary').click();await page.unroute('**/api/v1/resumes?*');
   await page.getByRole('button',{name:'重试读取历史简历',exact:true}).click();await page.locator('#resume-dropzone:enabled').waitFor();await page.locator('#resume-history summary').click();
   await page.locator('#resume-file').setInputFiles(path.join(__dirname,'fixtures/no-text.pdf'));
   await page.locator('#resume-status[data-state=error]').waitFor();
   assert.equal(await page.locator('#resume-status').innerText(),'未能从该 PDF 提取有效文字。扫描版简历暂不支持，请上传可复制文字的 PDF，或直接粘贴简历文本。');
   assert.ok(!(await page.locator('.resume-fields').isVisible()));await shot(page,'pdf-no-text-'+width);
   for(const file of [
    {name:'empty.txt',mimeType:'text/plain',buffer:Buffer.alloc(0)},
    {name:'resume.exe',mimeType:'application/octet-stream',buffer:Buffer.from(raw)},
    {name:'broken.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('broken')},
    {name:'huge.txt',mimeType:'text/plain',buffer:Buffer.alloc(10*1024*1024+1,65)},
   ]){await page.locator('#resume-file').setInputFiles(file);await page.locator('#resume-status[data-state=error]').waitFor();assert.ok(!(await page.locator('.resume-fields').isVisible()));}
   await page.route('**/api/v1/resumes/upload-preview',route=>route.abort());
   await page.locator('#resume-file').setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from(raw)});
   await page.locator('#resume-status').filter({hasText:'暂时无法连接'}).waitFor();await page.unroute('**/api/v1/resumes/upload-preview');
   // Exercise actual DataTransfer drop handler, not the file input handler.
   const transfer=await page.evaluateHandle(text=>{const dt=new DataTransfer();dt.items.add(new File([text],'学生 简历 (测试)&.txt',{type:'text/plain'}));return dt;},raw);
   await page.locator('#resume-dropzone').dispatchEvent('drop',{dataTransfer:transfer});await transfer.dispose();
   await page.locator('.resume-fields:visible').waitFor();await page.locator('#resume-status').filter({hasText:/AI 已完成结构化识别|演示识别结果/}).waitFor();
   assert.equal(await page.locator('#resume-raw').inputValue(),raw);
   await page.locator('#resume-education').fill('');await page.locator('#resume-skills').fill('SQL');await page.locator('#resume-reviewed').check();
   const field=page.locator('.resume-field').filter({has:page.locator('#resume-education')}).locator('.resume-field-badge');assert.equal(await field.innerText(),'未填写');
   await page.locator('#resume-parse').click();await page.locator('#resume-status').filter({hasText:/AI 已完成结构化识别|演示识别结果/}).waitFor();assert.equal(await page.locator('#resume-education').inputValue(),'');
   const first=await saved(page);
   const replacement='姓名：另一位同学\n教育背景：硕士\n技能：Python\n项目经历：不同的原文内容。';
   await page.locator('#resume-file').setInputFiles({name:'替换原文.txt',mimeType:'text/plain',buffer:Buffer.from(replacement)});
   await page.locator('#resume-status').filter({hasText:/AI 已完成结构化识别|演示识别结果/}).waitFor();
   assert.equal(await page.locator('#resume-name').inputValue(),first.name);assert.equal(await page.locator('#resume-education').inputValue(),'');assert.equal(await page.locator('#resume-skills').inputValue(),'SQL');
   assert.equal(await page.locator('#resume-raw').inputValue(),replacement);assert.ok(!(await page.locator('#resume-next').isVisible()));
   assert.deepEqual(await(await page.request.get(base+'/api/v1/resumes/'+first.id)).json(),first,'upload never overwrites stored facts');
   await page.locator('#resume-suggestion-education summary').click();await page.locator('#resume-suggestion-education button').click();assert.equal(await page.locator('#resume-education').inputValue(),'硕士');
   const second=await saved(page);assert.notEqual(first.id,second.id);
   await page.reload();await page.locator('#resume-dropzone:enabled').waitFor();
   await page.locator('#resume-history summary').click();await page.locator('#resume-history button[data-resume-id="'+first.id+'"]').click();
   await page.locator('#resume-next:visible').waitFor();assert.equal(await page.locator('#resume-raw').inputValue(),first.raw_text);assert.equal(await page.locator('#resume-education').inputValue(),'');
   const long='很长的中文项目描述，用于检查换行、可编辑区域和页面边界。'.repeat(120);
   await page.locator('#resume-experience-0').fill(long);assert.equal(await page.locator('#resume-experience-0').inputValue(),long);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(page,'resume-long-'+width);
   // Paste fallback remains a complete independent entry, after a failed file import.
   const paste=await browser.newPage({viewport:{width,height:width===390?844:1000}});await paste.goto(base);await paste.locator('#resume-dropzone:enabled').waitFor();
   await paste.locator('.resume-source summary').first().click();await paste.locator('#resume-raw').fill(raw);await paste.locator('#resume-parse').click();
   await paste.locator('.resume-fields:visible').waitFor();await paste.locator('#resume-status').filter({hasText:/AI 已完成结构化识别|演示识别结果/}).waitFor();await saved(paste);
   await paste.locator('#resume-next').click();await paste.locator('.current-resume').waitFor();await paste.locator('.job-form summary').click();await paste.locator('#jobs-title').fill('长文本展示测试');await paste.locator('#jobs-text').fill(long);
   assert.ok(await paste.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(paste,'jobs-long-'+width);
   // Market absences stay absences; a UI fixture does not modify stored samples.
   const market=await(await paste.request.get(base+'/api/v1/analytics?source_type=real')).json();
   market.market.salary_groups=[];market.market.salary_coverage={comparable_count:0,missing_range_count:market.market.sample_size,missing_unit_count:0};
   await paste.route('**/api/v1/analytics?*',route=>route.fulfill({json:market}));
   await paste.locator('[data-view=analytics]').click();await paste.locator('.analytics-empty-salary').waitFor();assert.equal(await paste.locator('.analytics-salary-range').count(),0);assert.match(await paste.locator('.analytics-empty-salary').innerText(),/数据不足/);
   await paste.locator('#analytics-filters summary').click();const abort=route=>route.abort();await paste.route('**/api/v1/analytics?*',abort);await paste.getByRole('button',{name:'应用筛选',exact:true}).click();await paste.locator('#analytics-status[data-state=error]').waitFor();assert.equal(await paste.locator('#analytics-metrics').count(),0);
   await paste.unroute('**/api/v1/analytics?*',abort);await paste.getByRole('button',{name:'应用筛选',exact:true}).click();await paste.locator('#analytics-metrics').waitFor();
   assert.deepEqual(errors,[]);await paste.close();await page.close();
   report.checks.push(width+'px: exact scan-PDF message; empty/type/corrupt/size/offline rejection; actual drag/drop; protected blank/reparse/upload; raw archive and prior save unchanged; explicit adoption; direct history; paste fallback; long text; missing salary; filter error/retry');
  }
  report.status='passed';
 }catch(error){report.status='failed';report.error=error.stack;throw error;}
 finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
