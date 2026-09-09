// Optional browser check: NODE_PATH must resolve Playwright; uses an independent Edge process.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8765';
  const output = path.resolve('.verification');
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const records = {};
  try {
    const page = await browser.newPage({viewport: {width: 1366, height: 950}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const original = '  技能：Python、SQL\n项目经历：使用 Python 清洗合成课程数据。\n ';
    const draftResponse = await page.request.post(base + '/api/v1/resumes/preview', {data: {raw_text: original}});
    assert.equal(draftResponse.status(), 200);
    const draft = await draftResponse.json();
    const saved = await page.request.post(base + '/api/v1/resumes', {data: {...draft, name: 'Browser smoke fixture', skills: ['SQL']}});
    assert.equal(saved.status(), 201);
    const resume = await saved.json(); records.resume_id = resume.id;
    assert.equal(resume.raw_text, original);
    await page.goto(base + '/');
    await page.locator('[data-view="jobs"]').click();
    await page.locator('#jobs-status').filter({hasText: '已加载'}).waitFor();
    assert.equal(new URL(page.url()).search, '');
    assert.equal(new URL(page.url()).hash, '#jobs');
    const banner = await page.locator('#mode-banner').innerText();
    assert.match(banner, /AI 诊断、市场分析/);
    assert.doesNotMatch(banner, /岗位匹配/);
    const run = page.getByRole('button', {name: '计算关键词匹配'});
    await run.click();
    await page.locator('#jobs-status').filter({hasText: '请选择'}).waitFor();
    await page.locator('#jobs-title').fill('Browser smoke fixture');
    await page.locator('#jobs-text').fill('Python SQL Docker');
    await page.getByRole('button', {name: '解析并保存 JD'}).click();
    await page.locator('#jobs-status').filter({hasText: 'JD 已解析并保存'}).waitFor();
    records.jd_id = await page.locator('#jobs-select').inputValue();
    await page.locator('#jobs-resume').selectOption(resume.id);
    await run.click();
    await page.locator('#jobs-result:not([hidden])').waitFor();
    assert.match(await page.locator('#jobs-result').innerText(), /33.33%/);
    assert.match(await page.locator('#jobs-result').innerText(), /Docker/);
    await page.screenshot({path: path.join(output, 'jobs-default-desktop.png'), fullPage: true});
    await page.route('**/api/v1/matches', route => route.fulfill({status: 502,
      contentType: 'application/json', body: JSON.stringify({error: {message: 'smoke failure'}})}));
    await run.click();
    await page.locator('#jobs-status').filter({hasText: 'smoke failure'}).waitFor();
    assert.equal(await page.locator('#jobs-result').isVisible(), false);
    await page.unroute('**/api/v1/matches');
    await run.click();
    await page.locator('#jobs-result:not([hidden])').waitFor();
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: path.join(output, 'jobs-default-mobile.png'), fullPage: true});
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-view="diagnosis"]').click();
      await page.locator('[data-view="jobs"]').click();
      await page.locator('#jobs-status').filter({hasText: '已加载'}).waitFor();
      assert.equal(await page.locator('#jobs-resume').inputValue(), records.resume_id);
      assert.equal(await page.locator('#jobs-select').inputValue(), records.jd_id);
    }
    let posts = 0;
    page.on('request', request => { if (request.url().endsWith('/api/v1/matches') && request.method() === 'POST') posts++; });
    await run.click();
    await page.locator('#jobs-result:not([hidden])').waitFor();
    assert.equal(posts, 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({status: 'PASS', checks: ['default Jobs navigation without preview',
      'real Resume preview/edit/save', 'real JD save/parse and keyword 33.33%/gap', '502 retry',
      '390px without overflow', 'shared selection and navigation cleanup'], records}));
  } finally {
    // The runner records IDs even on failure; cleanup only these explicit fixture IDs.
    fs.writeFileSync(path.join(output, 'jobs-default-records.json'), JSON.stringify(records));
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
