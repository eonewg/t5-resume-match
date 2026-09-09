// UI regression against the existing isolated product_browser_server (no paid AI).
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const initialWidth=Number(process.env.T5_SMOKE_WIDTH||1440);
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:initialWidth,height:initialWidth===390?844:1000}});
 const base=process.env.T5_SMOKE_URL||'http://127.0.0.1:8770';const out=process.env.T5_SMOKE_OUT||'.verification/ui-polish';fs.mkdirSync(out,{recursive:true});
 const report={checks:[],screens:[],model:'explicit demonstration fixture; no paid API'};const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);await page.locator('#resume-parse:enabled').waitFor();assert.equal(await page.locator('#module-view h1').innerText(),'我的简历');
  const labels=await page.locator('nav [data-view]').allTextContents();assert.deepEqual(labels,['我的简历','目标岗位','匹配分析','简历优化','市场洞察']);
  await page.screenshot({path:out+'/resume-empty-'+initialWidth+'.png',fullPage:true});
  report.initialWidth=initialWidth;
  const raw='姓名：界面验收\n教育背景：本科\n技能：Python、SQL\n项目经历：使用 Python 清洗 120 条课程记录，用 SQL 汇总。';
  const confirmed='使用 SQL 汇总 120 条课程记录，整理结果。';
  await page.locator('#resume-raw').fill(raw);await page.locator('#resume-parse').click();await page.locator('#resume-status').filter({hasText:'解析完成'}).waitFor();
  await page.locator('#resume-skills').fill('SQL');await page.locator('#resume-experience-0').fill(confirmed);
  await page.locator('#resume-parse').click();await page.locator('#resume-status').filter({hasText:'解析完成'}).waitFor();assert.equal(await page.locator('#resume-skills').inputValue(),'SQL');
  await page.locator('#resume-reviewed').check();await page.locator('#resume-save').click();await page.locator('#resume-status').filter({hasText:'已保存并重新读取'}).waitFor();
  assert.ok(await page.locator('#resume-next').evaluate(e=>e.classList.contains('primary')));
  const resumeId=await page.locator('#resume-history').inputValue();
  const saved=await(await page.request.get(base+'/api/v1/resumes/'+resumeId)).json();assert.equal(saved.raw_text,raw);assert.deepEqual(saved.skills,['SQL']);assert.deepEqual(saved.experience,[confirmed]);report.checks.push('parse → edit → reparse preserves confirmed facts; save and reread exact');
  await page.screenshot({path:out+'/resume-desktop.png',fullPage:true});
  await page.locator('#resume-next').click();await page.locator('#jobs-status').filter({hasText:'已加载'}).waitFor();
  await page.locator('.job-form summary').click();await page.locator('#jobs-title').fill('界面验收岗位');await page.locator('#jobs-text').fill('需要 SQL、Python 和 Docker。');
  await page.getByRole('button',{name:'整理并保存岗位',exact:true}).click();await page.locator('#jobs-status').filter({hasText:'已解析并保存'}).waitFor();
  const jdId=await page.locator('#jobs-select').inputValue();await page.locator('#jobs-run').click();await page.waitForURL('**/#matching');await page.locator('#jobs-result:not([hidden])').waitFor();
  assert.match(await page.locator('.match-score').innerText(),/33.33%/);assert.equal(await page.locator('.match-evidence').getAttribute('open'),null);
  assert.deepEqual(await page.locator('.ability-grid section:first-child li').allTextContents(),['SQL']);report.checks.push('real keyword result 33.33%; raw Python not restored; result survives navigation');
  await page.screenshot({path:out+'/matching-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'优化这份简历',exact:true}).click();await page.locator('#diagnosis-run:enabled').waitFor();
  // Deterministic model outage. Keep current selection, no forged success.
  await page.route('**/api/v1/diagnoses',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'模型服务暂不可用，请重试。'}})}));
  await page.locator('#diagnosis-run').click();await page.getByRole('button',{name:'重试生成建议'}).waitFor();assert.equal(await page.getByTestId('diagnosis-result').isVisible(),false);
  await page.screenshot({path:out+'/diagnosis-error.png',fullPage:true});
  await page.unroute('**/api/v1/diagnoses');
  // Exercise rich STAR UI with an explicitly marked fake, not a live capability claim.
  await page.route('**/api/v1/diagnoses',async route=>{await new Promise(r=>setTimeout(r,400));await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:'ui-demo',resume_id:resumeId,jd_id:jdId,summary:'演示数据：请核实后使用建议。',suggestions:[`【STAR】原文：${confirmed}\n优化：${confirmed}【待补充：具体成果】\n理由：保留原文事实。`,'【岗位建议】如有真实 Docker 经历，可补充具体实践。','<img src=x onerror=alert(1)>'],is_mock:true})});});
  await page.locator('#diagnosis-run').click();assert.equal(await page.locator('#diagnosis-run').isDisabled(),true);await page.locator('.feedback[data-state=busy]').waitFor();await page.screenshot({path:out+'/diagnosis-loading.png',fullPage:true});await page.getByTestId('diagnosis-result-mode').filter({hasText:'演示数据'}).waitFor();
  assert.equal(await page.locator('.suggestion-compare section:first-child p').innerText(),confirmed);assert.equal(await page.getByTestId('diagnosis-result').locator('img').count(),0);
  assert.equal(await page.locator('.suggestion-compare mark').innerText(),'【待补充：具体成果】');
  report.checks.push('model error clears output; retry; explicit demo provenance; STAR comparison preserves text and XSS remains text');
  await page.screenshot({path:out+'/diagnosis-desktop.png',fullPage:true});
  const laterFailure=route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'模型服务暂不可用，请重试。'}})});
  await page.route('**/api/v1/diagnoses',laterFailure);await page.locator('#diagnosis-run').click();await page.getByRole('button',{name:'重试生成建议'}).waitFor();
  assert.equal(await page.getByTestId('diagnosis-result').isVisible(),false);assert.equal(await page.locator('.suggestion-compare').count(),0);
  await page.unroute('**/api/v1/diagnoses',laterFailure);await page.locator('#diagnosis-run').click();await page.locator('.suggestion-compare').waitFor();
  report.checks.push('failed regeneration removes the previous successful STAR result; retry restores only new response');
  await page.locator('[data-view=analytics]').click();await page.locator('#analytics-source:enabled').waitFor();await page.locator('#analytics-metrics').waitFor();
  assert.ok(await page.locator('#analytics-salary').isVisible());assert.ok(await page.locator('#analytics-scope').innerText());
  // Import original archived real JD through existing API; no invented market numbers.
  await page.locator('.analytics-library summary').click();await page.locator('#analytics-import').click();await page.locator('#analytics-status').filter({hasText:'新增'}).waitFor();
  const market=await(await page.request.get(base+'/api/v1/analytics?source_type=real')).json();assert.ok(market.market.salary_coverage.missing_range_count>=5);
  await page.locator('#analytics-sources summary').click();assert.ok(await page.locator('#analytics-sources table').isVisible());
  await page.locator('#analytics-salary .helper-disclosure summary').click();assert.match(await page.locator('#analytics-salary').innerText(),/不以零薪资/);
  report.checks.push('market source/date/sample coverage and missing salary retained; archived import works');
  for(const width of [1440,1280,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   for(const route of ['resume','jobs','matching','diagnosis','analytics']){
    await page.locator('[data-view='+route+']').click();await page.locator('#module-view h1').waitFor();await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' overflow');
    assert.equal(await page.locator('nav [aria-current=page]').count(),1);
    const text=await page.locator('body').innerText();assert.doesNotMatch(text,/\b(?:embedding|pgvector|provider|semantic_score|semantic_status|source_hash|reasoning_effort|token|Mock|unknown|JD)\b/i,route+' terminology');
    await page.evaluate(()=>scrollTo(0,0));
    const file=out+'/'+route+'-'+width+'.png';await page.screenshot({path:file,fullPage:true});report.screens.push(file);
   }
  }
  // No selection and network failure states on a fresh browser page.
  const blank=await browser.newPage({viewport:{width:390,height:844}});await blank.goto(base+'/#matching');await blank.locator('#jobs-status').filter({hasText:'已加载'}).waitFor();assert.ok(await blank.locator('.product-empty').isVisible());await blank.locator('#jobs-run').click();await blank.locator('#jobs-status[data-error=true]').waitFor();
  await blank.route('**/api/v1/jobs?*',r=>r.abort());await blank.getByRole('button',{name:'刷新记录',exact:true}).click();await blank.locator('#jobs-status[data-error=true]').waitFor();await blank.unroute('**/api/v1/jobs?*');await blank.getByRole('button',{name:'刷新记录',exact:true}).click();await blank.locator('#jobs-status[data-error=false]').waitFor();await blank.close();
  const quick=await browser.newPage({viewport:{width:390,height:844}});await quick.goto(base+'/#workspace');await quick.locator('#load-demo').click();await quick.locator('#form-status').filter({hasText:'已填入'}).waitFor();await quick.locator('#run-workflow').click();await quick.locator('#results:not([hidden])').waitFor();assert.match(await quick.locator('#result-mode').innerText(),/演示数据/);await quick.close();report.checks.push('secondary raw workflow still available on mobile; demonstration results remain explicit');
  assert.deepEqual(errors,[]);report.checks.push('desktop/mobile five-page navigation, no overflow/engineering terms, empty selection, API error and refresh recovery');report.status='passed';
 }catch(e){report.status='failed';report.error=e.message;throw e;}finally{fs.writeFileSync(out+'/browser-report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})().catch(e=>{console.error(e.message);process.exitCode=1});
