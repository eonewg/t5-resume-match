// Start backend.main:app with default Mock providers on port 8767.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1366, height: 950}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8767/?preview=diagnosis#diagnosis');
    const button = page.getByRole('button', {name: '诊断当前简历'});
    await button.waitFor();
    assert.equal(await button.isDisabled(), true);
    await page.locator('[data-module="diagnosis"] a').click();
    await page.locator('#load-demo').click();
    await page.locator('#form-status').filter({hasText: '已填入'}).waitFor();
    await page.locator('#run-workflow').click();
    await page.locator('#results').waitFor({state: 'visible'});
    await page.locator('[data-view="diagnosis"]').click();
    await page.locator('[data-testid="diagnosis-result-mode"]').filter({hasText: 'Mock'}).waitFor();
    await button.click();
    await page.locator('[data-testid="diagnosis-result"]:not([hidden])').waitFor();
    await page.route('**/api/v1/diagnoses', route => route.fulfill({status: 502,
      contentType: 'application/json', body: JSON.stringify({error: {message: '模型执行失败'}})}));
    await button.click();
    await page.locator('[data-module="diagnosis"] [role="status"]').filter({hasText: '模型执行失败'}).waitFor();
    assert.equal(await page.locator('[data-testid="diagnosis-result"]').isVisible(), false);
    assert.equal(await button.isEnabled(), true);
    await page.unroute('**/api/v1/diagnoses');
    await button.click();
    await page.locator('[data-testid="diagnosis-result"]:not([hidden])').waitFor();
    const desktop = path.join(os.tmpdir(), 't5-d-shell-desktop.png');
    await page.screenshot({path: desktop, fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const mobile = path.join(os.tmpdir(), 't5-d-shell-mobile.png');
    await page.screenshot({path: mobile, fullPage: true});
    // Long hostile model output is rendered as text; no HTML is executed.
    await page.route('**/api/v1/diagnoses', async route => {
      const upstream = await route.fetch();
      const data = await upstream.json();
      data.summary = '<img src=x onerror="window.injected=true">' + '长文本'.repeat(400);
      await route.fulfill({json: data});
    });
    await button.click();
    await page.locator('[data-testid="diagnosis-result"]:not([hidden])').waitFor();
    assert.equal(await page.locator('[data-testid="diagnosis-result"] img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.unroute('**/api/v1/diagnoses');
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-module="diagnosis"] a').click();
      await page.locator('[data-view="diagnosis"]').click();
      await button.waitFor();
    }
    let posts = 0;
    page.on('request', req => { if (req.url().endsWith('/api/v1/diagnoses') && req.method() === 'POST') posts++; });
    await button.click();
    await page.locator('[data-testid="diagnosis-result"]:not([hidden])').waitFor();
    assert.equal(posts, 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({status: 'PASS', desktop, mobile, checks: ['public shell preview',
      'missing selection', 'public pair API', 'Mock label', 'failure/retry', '390px', 'long text/XSS', 'navigation cleanup']}));
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
