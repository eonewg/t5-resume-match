// Run against tests.core.product_browser_server; it owns and cleans the disposable PG schema.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8770';
  const output = path.resolve('.verification'); fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const report = {status: 'RUNNING', checks: []};
  try {
    await page.goto(base + '/#resume');
    await page.locator('#resume-parse:enabled').waitFor();
    const student = JSON.parse(fs.readFileSync('data/holdout/2026-09-08/resumes/student-03.json', 'utf8'));
    await page.locator('#resume-raw').fill(student.raw_text);
    await page.locator('#resume-parse').click();
    await page.locator('#resume-status').filter({hasText: '解析完成'}).waitFor();
    assert.equal(await page.locator('#resume-skills').inputValue(), 'Python');
    assert.equal(await page.locator('.resume-experience').count(), 10);
    assert.doesNotMatch(await page.locator('#resume-education').inputValue(), /Research Assistant/);
    report.checks.push('student-03: Python and 10 source-backed experience sections');

    page.once('dialog', dialog => dialog.accept()); await page.locator('#resume-new').click();
    const raw = '  姓名：合成浏览器验证\n学历：本科\n技能：Python、SQL\n项目经历：使用 Python 清洗课程合成数据。\n ';
    await page.locator('#resume-raw').fill(raw); await page.locator('#resume-parse').click();
    await page.locator('#resume-status').filter({hasText: '解析完成'}).waitFor();
    await page.locator('#resume-name').fill('浏览器确认样例');
    await page.locator('#resume-skills').fill('SQL');
    const experience = '课程记录整理\n仅使用 SQL，未提供量化成果。';
    await page.locator('#resume-experience-0').fill(experience);
    await page.locator('#resume-education').fill('本科 · 用户确认');
    await page.locator('#resume-parse').click();
    await page.locator('#resume-status').filter({hasText: '已编辑或确认字段保持不变'}).waitFor();
    assert.equal(await page.locator('#resume-skills').inputValue(), 'SQL');
    assert.equal(await page.locator('#resume-experience-0').inputValue(), experience);
    assert.equal(await page.locator('#resume-education').inputValue(), '本科 · 用户确认');
    await page.locator('#resume-suggestion-education summary').click();
    await page.locator('#resume-suggestion-education button').click();
    assert.equal(await page.locator('#resume-education').inputValue(), '本科');
    await page.route('**/api/v1/resumes/preview', route => route.fulfill({status: 502, contentType: 'application/json', body: JSON.stringify({error: {message: '解析服务测试失败'}})}));
    await page.locator('#resume-parse').click();
    await page.locator('#resume-status').filter({hasText: '解析服务测试失败'}).waitFor();
    assert.equal(await page.locator('#resume-skills').inputValue(), 'SQL');
    await page.unroute('**/api/v1/resumes/preview');
    report.checks.push('edited values protected from reparse; explicit per-field adoption; parse failure retains edits');

    let saves = 0;
    page.on('request', request => { if (request.url() === base + '/api/v1/resumes' && request.method() === 'POST') saves++; });
    await page.route('**/api/v1/resumes/resume_*', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: {message: '读取测试失败'}})}));
    await page.locator('#resume-reviewed').check(); await page.locator('#resume-save').click();
    await page.locator('#resume-status').filter({hasText: '保存已成功，但重新读取未完成'}).waitFor();
    assert.equal(await page.locator('#resume-next').isVisible(), false);
    await page.unroute('**/api/v1/resumes/resume_*'); await page.locator('#resume-save').click();
    await page.locator('#resume-status').filter({hasText: '已保存并重新读取'}).waitFor();
    assert.equal(saves, 1);
    const resumeId = await page.locator('#resume-history').inputValue();
    const saved = await (await page.request.get(base + '/api/v1/resumes/' + resumeId)).json();
    assert.equal(saved.raw_text, raw); assert.deepEqual(saved.skills, ['SQL']); assert.deepEqual(saved.experience, [experience]);
    await page.reload(); await page.locator('#resume-load:enabled').waitFor();
    await page.locator('#resume-history').selectOption(resumeId); await page.locator('#resume-load').click();
    await page.locator('#resume-status').filter({hasText: '已重新加载保存版本'}).waitFor();
    assert.equal(await page.locator('#resume-skills').inputValue(), 'SQL');
    assert.equal(await page.locator('#resume-experience-0').inputValue(), experience);
    await page.screenshot({path: path.join(output, 'product-resume-desktop.png'), fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: path.join(output, 'product-resume-mobile.png'), fullPage: true});
    await page.setViewportSize({width: 1440, height: 1000});
    report.checks.push('POST save + verified GET; reread retry without duplicate; page reload consistency; desktop/mobile editor');

    await page.locator('#resume-next').click();
    await page.locator('#jobs-status').filter({hasText: '已加载'}).waitFor();
    assert.equal(await page.locator('#jobs-resume').inputValue(), resumeId);
    await page.locator('#jobs-title').fill('合成浏览器岗位');
    await page.locator('#jobs-text').fill('Python SQL Docker\n薪资：CNY 10-20K/月');
    await page.getByRole('button', {name: '解析并保存 JD', exact: true}).click();
    await page.locator('#jobs-status').filter({hasText: 'JD 已解析并保存'}).waitFor();
    await page.getByRole('button', {name: '计算匹配', exact: true}).click();
    await page.locator('#jobs-result:not([hidden])').waitFor();
    assert.match(await page.locator('#jobs-result').innerText(), /33.33%/);
    assert.match(await page.locator('#jobs-result').innerText(), /未启用向量增强/);
    assert.doesNotMatch(await page.locator('#mode-banner').innerText(), /市场分析/);
    report.checks.push('real PG Resume editor -> JD -> keyword Match, confirmed SQL only, semantic off');

    await page.locator('[data-view="resume"]').click(); await page.locator('#resume-parse:enabled').waitFor();
    await page.locator('#resume-skills').fill('保留未保存修改');
    await page.locator('[data-view="analytics"]').click(); await page.locator('#analytics-source:enabled').waitFor();
    await page.locator('[data-view="resume"]').click(); await page.locator('#resume-parse:enabled').waitFor();
    assert.equal(await page.locator('#resume-skills').inputValue(), '保留未保存修改');
    report.checks.push('unsaved draft survives navigation');

    await page.locator('[data-view="analytics"]').click(); await page.locator('#analytics-empty').waitFor();
    await page.locator('.analytics-library summary').click(); await page.locator('#analytics-import').click();
    await page.locator('#analytics-status').filter({hasText: '新增 5 条'}).waitFor();
    const market = await (await page.request.get(base + '/api/v1/analytics?source_type=real')).json();
    assert.equal(market.market.sample_size, 5); assert.equal(market.market.company_count, 1);
    assert.equal(market.market.salary_coverage.missing_range_count, 5);
    assert.equal(await page.locator('#analytics-sources tbody tr').count(), 5);
    assert.match(await page.locator('#analytics-salary').innerText(), /没有可比较的薪资区间/);
    assert.match(await page.locator('#analytics-observations').innerText(), /不能外推/);
    fs.writeFileSync(path.join(output, 'product-market-real.json'), JSON.stringify(market, null, 2));
    await page.screenshot({path: path.join(output, 'product-analytics-real-desktop.png'), fullPage: true});
    await page.locator('#analytics-import').click(); await page.locator('#analytics-status').filter({hasText: '新增 0 条，已有 5 条'}).waitFor();
    await page.locator('#analytics-to').fill('2026-09-07'); await page.getByRole('button', {name: '更新分析', exact: true}).click();
    await page.locator('#analytics-empty').waitFor();
    await page.locator('#analytics-to').fill(''); await page.getByRole('button', {name: '更新分析', exact: true}).click();
    await page.locator('#analytics-sources').waitFor();
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: path.join(output, 'product-analytics-real-mobile.png'), fullPage: true});
    report.checks.push('5 traceable real snapshots, idempotent import, source/date filters, unknown salary excluded not zero, mobile charts');

    await page.setViewportSize({width: 1440, height: 1000});
    for (const [currency, period] of [['CNY', 'year'], ['USD', 'month'], ['EUR', 'hour'], ['USD', null]]) {
      const response = await page.request.post(base + '/api/v1/jobs', {data: {title: `Synthetic ${currency}/${period}`, jd_text: 'Python SQL',
        source_type: 'synthetic', salary_min: 15, salary_max: 20, currency, salary_period: period}});
      assert.equal(response.status(), 201);
    }
    await page.locator('#analytics-source').selectOption('synthetic'); await page.getByRole('button', {name: '更新分析', exact: true}).click();
    await page.locator('.analytics-salary-group').first().waitFor();
    assert.equal(await page.locator('.analytics-salary-group').count(), 3);
    assert.equal(await page.locator('.analytics-salary-group[data-currency="USD"][data-period="month"]').count(), 1);
    assert.equal(await page.locator('.analytics-salary-group[data-currency="CNY"][data-period="year"]').count(), 1);
    assert.equal(await page.locator('.analytics-salary-group[data-currency="EUR"][data-period="hour"]').count(), 1);
    assert.match(await page.locator('#analytics-salary').innerText(), /币种\/周期未确认或不支持 1 条/);
    await page.screenshot({path: path.join(output, 'product-analytics-salary-fixtures.png'), fullPage: true});
    await page.route('**/api/v1/analytics?*', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: {message: '分析服务测试失败'}})}));
    await page.getByRole('button', {name: '更新分析', exact: true}).click();
    await page.locator('#analytics-status').filter({hasText: '分析服务测试失败'}).waitFor();
    assert.equal(await page.locator('#analytics-salary').count(), 0);
    await page.unroute('**/api/v1/analytics?*'); await page.getByRole('button', {name: '更新分析', exact: true}).click();
    await page.locator('#analytics-salary').waitFor();
    assert.deepEqual(errors, []);
    report.checks.push('synthetic salary ranges segregated by currency/period; missing unit accounted; API error/retry');
    report.status = 'PASS'; console.log(JSON.stringify(report));
  } catch (error) {
    report.status = 'FAIL'; report.error = error.message;
    await page.screenshot({path: path.join(output, 'product-failure.png'), fullPage: true}); throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'product-browser-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
