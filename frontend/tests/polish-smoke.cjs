// Presentation boundary checks against the existing disposable PostgreSQL server.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({channel:'msedge', headless:true});
  const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8770';
  const out = process.env.T5_POLISH_OUT || '.verification/ui-polish-boundaries';
  fs.mkdirSync(out,{recursive:true});
  const report = {checks:[], widths:[1440,1280,390], status:'running'};
  try {
    for (const width of report.widths) {
      const page = await browser.newPage({viewport:{width,height:width===390?844:1000}});
      await page.goto(base);
      await page.locator('#resume-parse:enabled').waitFor();
      const suggestion = await page.evaluate(async()=>{
        const {suggestionText} = await import('/assets/core/ui.js');
        const element = document.createElement('p');
        const text = '【待处理】原始标签 <img src=x onerror=alert(1)>\n真实文字【待补充：成果】';
        suggestionText(element,text);
        return {text:element.textContent,expected:text,marks:[...element.querySelectorAll('mark')].map(e=>e.textContent),images:element.querySelectorAll('img').length};
      });
      assert.equal(suggestion.text,suggestion.expected);assert.deepEqual(suggestion.marks,['【待补充：成果】']);assert.equal(suggestion.images,0);
      const raw = '姓名：展示样例\n教育背景：本科\n技能：Python、SQL\n项目经历：使用 Python 清洗课程记录，用 SQL 汇总结果。';
      const originalBoxes = await page.locator('.resume-fields textarea').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
      assert.ok(originalBoxes.every(h=>h<100));
      let releaseParse;
      let signalParse;
      const parseIntercepted = new Promise(resolve=>{signalParse=resolve;});
      await page.route('**/api/v1/resumes/preview', async route => {await new Promise(resolve=>{releaseParse=resolve;signalParse();});await route.continue();});
      await page.locator('#resume-raw').fill(raw);
      await page.locator('#resume-parse').click();
      await page.locator('#resume-status[data-state=busy]').waitFor();
      assert.ok(await page.locator('#resume-parse').isDisabled());
      await parseIntercepted;
      releaseParse();
      await page.locator('#resume-status').filter({hasText:'解析完成'}).waitFor();
      await page.unroute('**/api/v1/resumes/preview');
      await page.locator('#resume-education').fill('');
      await page.locator('#resume-skills').fill('SQL');
      await page.locator('#resume-reviewed').check();
      assert.equal(await page.locator('.resume-field').filter({has:page.locator('#resume-education')}).locator('.resume-field-badge').innerText(),'未填写');
      assert.ok(await page.locator('#resume-save').evaluate(e=>e.classList.contains('primary')));
      await page.locator('#resume-parse').click();
      await page.locator('#resume-status').filter({hasText:'解析完成'}).waitFor();
      assert.equal(await page.locator('#resume-education').inputValue(),'');
      await page.locator('#resume-suggestion-education summary').click();
      await page.locator('#resume-suggestion-education button').click();
      assert.equal(await page.locator('#resume-education').inputValue(),'本科');
      await page.locator('#resume-reviewed').check();await page.locator('#resume-save').click();
      await page.locator('#resume-status').filter({hasText:'已保存并重新读取'}).waitFor();
      const savedId = await page.locator('#resume-history').inputValue();
      await page.locator('#resume-experience-0').fill('核对数据后整理结果。');
      const newVersion = page.waitForResponse(r=>r.url().endsWith('/api/v1/resumes') && r.request().method()==='POST');
      await page.locator('#resume-reviewed').check();await page.locator('#resume-save').click();
      await page.locator('#resume-status').filter({hasText:'已保存并重新读取'}).waitFor();
      const newRecord = await (await newVersion).json();
      assert.notEqual(newRecord.id,savedId);
      assert.equal(await page.locator('#resume-history option[value="'+newRecord.id+'"]').count(),1);
      await page.reload();await page.locator('#resume-parse:enabled').waitFor();
      await page.locator('#resume-history').selectOption(savedId);await page.locator('#resume-load').click();
      await page.locator('#resume-next:not([hidden])').waitFor();assert.equal(await page.locator('#resume-raw').inputValue(),raw);
      const long = '很长的中文项目描述，用于检查换行、可编辑区域和页面边界。'.repeat(120);
      await page.locator('#resume-experience-0').fill(long);
      assert.equal(await page.locator('#resume-experience-0').inputValue(),long);
      assert.ok(await page.locator('#resume-experience-0').evaluate(e=>e.scrollHeight>=e.clientHeight));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:out+'/resume-long-'+width+'.png',fullPage:true});
      await page.locator('[data-view=jobs]').click();await page.locator('#jobs-status').filter({hasText:'已加载'}).waitFor();
      await page.locator('.job-form summary').click();await page.locator('#jobs-title').fill('长文本展示测试');
      await page.locator('#jobs-text').fill(long);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:out+'/jobs-long-'+width+'.png',fullPage:true});
      await page.locator('[data-view=analytics]').click();await page.locator('#analytics-metrics').waitFor();
      await page.locator('#analytics-sources summary').click();
      const table = page.locator('#analytics-sources .analytics-table-scroll');
      assert.ok(await table.evaluate(e=>e.clientWidth<=innerWidth));
      if(width===390) {
        assert.ok(await table.evaluate(e=>e.scrollWidth>e.clientWidth));
        assert.ok(await page.locator('nav').evaluate(e=>Math.abs(e.getBoundingClientRect().bottom-innerHeight)<1));
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:out+'/sources-'+width+'.png',fullPage:true});
      // Empty salary is an absence, not zero; UI fixture only, never changes market samples.
      const response = await (await page.request.get(base+'/api/v1/analytics?source_type=real')).json();
      response.market.salary_groups=[];
      response.market.salary_coverage={comparable_count:0,missing_range_count:response.market.sample_size,missing_unit_count:0};
      await page.route('**/api/v1/analytics?*',r=>r.fulfill({json:response}));
      await page.getByRole('button',{name:'更新分析',exact:true}).click();
      await page.locator('.analytics-empty-salary').waitFor();
      assert.match(await page.locator('.analytics-empty-salary').innerText(),/数据不足/);
      assert.equal(await page.locator('.analytics-salary-range').count(),0);
      await page.close();
      report.checks.push(width+'px: compact empty fields; parsing feedback; protected blank stays blank; explicit proposal adoption; edit saves new version; reload/history; long text; table-contained scrolling; missing salary');
    }
    report.status='passed';
  } catch(error) {report.status='failed';report.error=error.message;throw error;}
  finally {fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
