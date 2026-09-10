// Isolated UI acceptance; real keyword API, explicit fixture for AI rendering/recovery.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.T5_SMOKE_URL;
const out = path.join(process.env.T5_SMOKE_OUT, 'assessment');
fs.mkdirSync(out, { recursive: true });
async function post(route, body) {
  const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.ok(response.ok);
  return response.json();
}
(async () => {
  await post('/api/v1/resumes', { name: 'Synthetic Demo Resume', raw_text: 'Synthetic Demo Resume',
    education: '计算机本科', skills: ['熟悉 C++、Linux 和 MySQL；未掌握 Redis'], experience: ['使用 C++ 开发课程网络服务'] });
  const job = await post('/api/v1/jobs', { title: 'Synthetic Demo C++ Job', company: '合成演示',
    jd_text: '要求 C++、Linux、MySQL、Redis，有网络服务开发经历，计算机本科。', source_type: 'synthetic' });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/#/resume/history');
      await page.getByRole('button', { name: '打开简历 →', exact: true }).click();
      await page.locator('#resume-next').click();
      await page.locator(`[data-job-id="${job.id}"]`).click();
      const matching = page.waitForResponse(r => r.url().endsWith('/api/v1/matches') && r.request().method() === 'POST');
      await page.locator('#jobs-run').click();
      const record = await (await matching).json();
      await page.locator('#match-assess').waitFor();
      assert.equal(await page.locator('#match-score').innerText(), '75%');
      let calls = 0;
      await page.route('**/api/v1/matches/*/assessment', route => {
        calls++;
        if (calls === 1) return route.fulfill({ status: 502, json: { error: { message: '上游内容过滤，未生成综合评估。' } } });
        return route.fulfill({ json: { ...record, ai_assessment: { score: 68, model: 'explicit-ui-fixture',
          summary: '合成演示：已有相关技能和课程项目证据，Redis 仍需补充真实实践。',
          dimensions: ['skills', 'experience', 'education'].map(dimension => ({ dimension, applicable: true,
            score: 68, reason: '这是用于验证页面展示的固定评估，不代表真实模型判断。',
            jd_quotes: [job.jd_text], resume_quotes: ['使用 C++ 开发课程网络服务'] })) } } });
      });
      await page.locator('#match-assess').click();
      await page.getByRole('button', { name: '重试综合评估', exact: true }).waitFor();
      assert.equal(calls, 1);
      assert.equal(await page.locator('#match-score').innerText(), '75%');
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `error-${width}.png`), fullPage: true });
      await page.locator('#match-assess').click();
      await page.locator('.match-ai-score').waitFor();
      await page.locator('.match-ai-dimensions summary').first().click();
      assert.equal(calls, 2);
      assert.equal(await page.locator('#match-score').innerText(), '75%');
      assert.match(await page.locator('.match-ai-score').innerText(), /68/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `success-${width}.png`), fullPage: true });
      await page.locator('[data-view=jobs]').click();
      await page.locator('[data-view=matching]').click();
      await page.locator('.match-ai-score').waitFor();
      assert.equal(calls, 2, 'navigation reuses assessment');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: 1440/1280px; real keyword sentence matching; AI fixture failure/retry, separate scores, evidence, cache, no overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
