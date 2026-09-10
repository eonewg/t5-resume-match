// Optional module UI check. Start the explicit Mock app on port 8766 first.
// Requires Playwright and Microsoft Edge; no npm dependency change to the shared project.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1366, height: 950}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8766');
    await page.locator('#mode').filter({hasText: 'Mock'}).waitFor();
    await page.getByRole('button', {name: '填入示例'}).click();
    await page.getByRole('button', {name: '开始诊断'}).click();
    await page.locator('#results').waitFor({state: 'visible'});
    assert.match(await page.locator('#summary').innerText(), /Mock/);
    assert.match(await page.locator('#stars').innerText(), /原文[\s\S]*优化[\s\S]*理由/);
    // Untrusted resume/model content must remain text, never interpreted as HTML.
    await page.locator('#resume').fill('<img src=x onerror="window.injected=true"> 使用 Python');
    await page.getByRole('button', {name: '开始诊断'}).click();
    await page.locator('#results').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('#stars img').count(), 0);
    await page.getByRole('button', {name: '填入示例'}).click();
    await page.getByRole('button', {name: '开始诊断'}).click();
    await page.locator('#results').waitFor({state: 'visible'});
    const desktop = path.join(os.tmpdir(), 't5-d-diagnosis-desktop.png');
    await page.screenshot({path: desktop, fullPage: true});
    await page.setViewportSize({width: 1280, height: 800});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const compactDesktop = path.join(os.tmpdir(), 't5-d-diagnosis-compactDesktop.png');
    await page.screenshot({path: compactDesktop, fullPage: true});
    await page.route('**/api/diagnose', route => route.fulfill({
      status: 502, contentType: 'application/json', body: JSON.stringify({error: '模型服务暂不可用'})
    }));
    await page.getByRole('button', {name: '开始诊断'}).click();
    await page.locator('#status').filter({hasText: '模型服务暂不可用'}).waitFor();
    assert.equal(await page.locator('#results').isVisible(), false);
    assert.equal(await page.locator('#submit').isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({status: 'PASS', desktop, compactDesktop,
      checks: ['demo flow', 'STAR rendering', 'XSS text rendering', 'compactDesktop width', 'error recovery']}));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
