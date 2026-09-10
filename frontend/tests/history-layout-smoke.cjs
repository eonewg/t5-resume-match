// Built frontend only; synthetic resumes and intercepted requests, no database or AI calls.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const rows = Array.from({ length: 13 }, (_, i) => ({
        id: `layout-${i}`, name: `合成简历 ${i}`, raw_text: 'Synthetic Demo Resume',
        education: '合成大学 · 计算机专业 · 本科。'.repeat(15),
        skills: ['Python', 'SQL'], experience: Array.from({ length: 20 }, (_, j) => `合成经历 ${j}：${'用于验证长文本阅读和独立滚动。'.repeat(20)}`),
      }));
      await page.route('http://history.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/v1/modules') return route.fulfill({ json: {} });
        if (url.pathname === '/api/v1/resumes') return route.fulfill({ json: rows });
        if (url.pathname.startsWith('/api/')) throw Error(`Unexpected API request: ${url.pathname}`);
        return route.fulfill({ path: path.join(__dirname, '../dist', url.pathname === '/' ? 'index.html' : url.pathname) });
      });
      await page.goto('http://history.test/#/resume/history');
      const preview = page.getByRole('complementary', { name: '版本预览' });
      const list = page.getByRole('region', { name: '已保存简历版本' });
      await page.getByRole('button', { name: '合成简历 0', exact: true }).waitFor();
      const geometry = await page.evaluate(() => {
        const left = document.querySelector('.history-list-panel').getBoundingClientRect();
        const right = document.querySelector('.history-detail').getBoundingClientRect();
        return { left: left.width, right: right.width, bottom: right.bottom, height: innerHeight,
          pageHeight: document.documentElement.scrollHeight, pageWidth: document.documentElement.scrollWidth };
      });
      assert.ok(geometry.right > geometry.left * 1.6, JSON.stringify(geometry));
      assert.ok(geometry.bottom <= height && geometry.pageHeight <= height, JSON.stringify(geometry));
      assert.ok(geometry.pageWidth <= width);
      await preview.hover();
      await page.mouse.wheel(0, 600);
      await page.waitForFunction(() => document.querySelector('.history-detail').scrollTop > 0);
      assert.equal(await list.evaluate(el => el.scrollTop), 0);
      assert.equal(await page.evaluate(() => window.scrollY), 0);
      const previewTop = await preview.evaluate(el => el.scrollTop);
      await list.hover();
      await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => document.querySelector('.history-list-scroll').scrollTop > 0);
      assert.equal(await preview.evaluate(el => el.scrollTop), previewTop);
      assert.equal(await page.evaluate(() => window.scrollY), 0);
      await page.getByRole('button', { name: '合成简历 1', exact: true }).click();
      assert.equal(await preview.evaluate(el => el.scrollTop), 0);
      await preview.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await preview.hover();
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => window.scrollY), 0);
      console.log(`PASS ${width}x${height}: preview priority, independent scrolling, scroll containment, version reset`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
