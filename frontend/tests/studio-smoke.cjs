// Run only against the disposable server supplied by product-shell-smoke.cjs.
// Resume suggestions use an explicit fixture; matches and Mock diagnoses are persisted via the API.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.T5_SMOKE_URL;
const out = path.join(process.env.T5_DESKTOP_OUT || '.verification/studio', 'studio');
assert.ok(base, 'T5_SMOKE_URL must point to the isolated acceptance server');
fs.mkdirSync(out, { recursive: true });
const sizes = [[1920,1080], [1440,900], [1366,768], [1280,800]];
const report = { status: 'running', evidence: 'Disposable database; real delete/cascade API; deterministic suggestion fixture; offline Mock diagnosis', sizes: [], screenshots: [] };
async function shot(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': no horizontal overflow');
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  report.screenshots.push(file);
}
async function post(page, endpoint, data) {
  const response = await page.request.post(base + endpoint, { data });
  assert.ok(response.ok(), endpoint + ': ' + await response.text());
  return response.json();
}
async function history(page) {
  await page.locator('[data-view="resume/history"]').click();
  await page.locator('.history-page').waitFor();
  await page.getByRole('button', { name: '刷新档案', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.history-toolbar button')?.disabled);
}
async function parse(page) {
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/resumes/preview'));
  await page.locator('#resume-parse').click();
  assert.equal((await response).status(), 200);
  await page.locator('#resume-parse:enabled').waitFor();
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const names = [];
      for (let index = 0; index < 14; index++) {
        const name = `档案验收 ${width} · ${index + 1}`;
        names.push(await post(page, '/api/v1/resumes', { name, raw_text: '合成经历：使用 Python 整理课程数据。', education: '计算机科学 · 本科', skills: ['Python'], experience: ['使用 Python 整理课程数据。'] }));
      }
      const selected = names.at(-1);
      const jobs = [];
      for (let index = 0; index < 4; index++) jobs.push(await post(page, '/api/v1/jobs', { title: `Studio ${width} Role ${index}`, company: '合成验收工作室', jd_text: 'Python SQL 数据分析', source_type: 'synthetic' }));
      await page.goto(base + '/#/resume/history');
      await page.getByRole('heading', { name: selected.name, exact: true }).waitFor();
      assert.equal(await page.locator('.history-card').count(), 12);
      await shot(page, 'history-collection-' + width);
      // Cancellation must leave both the database and visible record intact.
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: '删除简历 ' + selected.name, exact: true }).click();
      assert.equal((await page.request.get(base + '/api/v1/resumes/' + selected.id)).status(), 200);
      const card = page.locator('.history-card').filter({ has: page.getByRole('heading', { name: selected.name, exact: true }) });
      await card.getByRole('button', { name: '打开简历 →', exact: true }).click();
      await page.locator('#resume-next').waitFor();
      await page.locator('#resume-next').click();
      await page.locator('#job-search').waitFor();
      await page.locator('#job-search').fill(`Studio ${width} Role 2`);
      assert.equal(await page.locator('.job-option').count(), 1);
      await page.locator('#job-search').fill('不存在的目标-zz-no-match');
      await page.getByText('没有找到相符的岗位。试试其他关键词，或添加新的目标。', { exact: true }).waitFor();
      assert.equal(await page.locator('.job-option').count(), 0);
      await shot(page, 'jobs-search-empty-' + width);
      await page.locator('#job-search').fill('');
      await page.getByRole('button', { name: '＋ 添加岗位', exact: true }).click();
      assert.notEqual(await page.locator('.job-form').getAttribute('open'), null);
      await page.locator('#jobs-title').waitFor({ state: 'visible' });
      await page.locator('.job-form summary').click();
      await page.locator(`[data-job-id="${jobs[0].id}"]`).click();
      const matchResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/matches') && r.request().method() === 'POST');
      await page.locator('#jobs-run').click();
      const match = await (await matchResponse).json();
      assert.ok(match.id);
      await page.locator('#jobs-result').waitFor();
      const diagnosisResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/diagnoses') && r.request().method() === 'POST');
      await page.locator('#matching-optimize').click();
      const diagnosis = await (await diagnosisResponse).json();
      assert.ok(diagnosis.id);
      await page.getByTestId('diagnosis-result').waitFor({ state: 'visible' });
      await history(page);
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: '删除简历 ' + selected.name, exact: true }).click();
      await page.getByRole('heading', { name: selected.name, exact: true }).waitFor({ state: 'detached' });
      for (const endpoint of ['/resumes/' + selected.id, '/matches/' + match.id, '/diagnoses/' + diagnosis.id])
        assert.equal((await page.request.get(base + '/api/v1' + endpoint)).status(), 404, 'cascade deleted ' + endpoint);
      assert.equal((await page.request.get(base + '/api/v1/jobs/' + jobs[0].id)).status(), 200, 'job survives resume deletion');
      await page.locator('[data-view="matching"]').click();
      await page.getByRole('heading', { name: '还没有匹配结果', exact: true }).waitFor();
      assert.equal(await page.locator('#jobs-result').count(), 0);
      await page.locator('[data-view="diagnosis"]').click();
      await page.getByRole('heading', { name: '先选择简历和目标岗位', exact: true }).waitFor();
      assert.equal(await page.getByTestId('diagnosis-result').isVisible(), false);
      await history(page);
      await page.getByRole('button', { name: '下一页 →', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.history-toolbar p')?.textContent?.includes('第 2 页'));
      await shot(page, 'history-page-two-' + width);
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: '清空全部', exact: true }).click();
      await page.getByRole('heading', { name: '你的故事，从第一份简历开始', exact: true }).waitFor();
      assert.deepEqual(await (await page.request.get(base + '/api/v1/resumes?limit=100&offset=0')).json(), []);
      await shot(page, 'history-empty-' + width);
      // Use a fresh editor to isolate suggestion behavior from retained deletion drafts.
      await page.goto(base + '/#/resume');
      await page.reload();
      await page.locator('#resume-dropzone:enabled').waitFor();
      const raw = '明确的合成验收原文：Python 和 SQL。';
      await page.locator('#resume-raw').fill(raw);
      await page.locator('#resume-skills').fill('Python');
      let suggestedSkills = [' python '];
      await page.route('**/api/v1/resumes/preview', route => route.fulfill({ status: 200, json: { raw_text: raw, name: '建议验收', education: '本科', skills: suggestedSkills, experience: ['验收经历'] } }));
      await parse(page);
      assert.equal(await page.locator('#resume-suggestion-skills').isVisible(), false, 'existing skill suppressed');
      suggestedSkills = ['Python', 'SQL', 'SQL'];
      await parse(page);
      await page.locator('#resume-suggestion-skills').waitFor({ state: 'visible' });
      await page.locator('#resume-suggestion-skills summary').click();
      assert.equal((await page.locator('#resume-suggestion-skills pre').innerText()).trim(), 'SQL', 'only unique new suggestion shown');
      await page.locator('#resume-suggestion-skills button').click();
      assert.deepEqual((await page.locator('#resume-skills').inputValue()).split('\n'), ['Python', 'SQL']);
      await page.locator('#resume-skills').fill('Python\nSQL 实践');
      await parse(page);
      assert.equal(await page.locator('#resume-suggestion-skills').isVisible(), false, 'adopted suggestion stays dismissed after manual editing and parsing');
      await shot(page, 'resume-suggestions-' + width);
      assert.deepEqual(errors, []);
      report.sizes.push({ width, height, historyPagination: true, cancellation: true, cascadeDeletion: true, selectionInvalidation: true, clearAcrossPages: true, jobSearch: true, addEntry: true, suggestionDeduplication: true });
      await page.close();
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = error.stack; throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    console.log(JSON.stringify(report));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
