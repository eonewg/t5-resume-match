const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [1920, 1440, 1366, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base);
      await page.locator('.sidebar-toggle').waitFor();
      for (let direction = 0; direction < 2; direction++) {
        const frames = await page.evaluate(async () => {
          const sample = () => [...document.querySelectorAll('.sidebar nav a')].map(e => {
            const rect = e.getBoundingClientRect();
            return { height: rect.height, top: rect.top };
          });
          const frames = [sample()];
          document.querySelector('.sidebar-toggle').click();
          const started = performance.now();
          do {
            await new Promise(requestAnimationFrame);
            frames.push(sample());
          } while (performance.now() - started < 260);
          return frames;
        });
        for (const frame of frames) frame.forEach((row, i) => {
          assert.ok(Math.abs(row.height - 48) < 1, `row wraps at ${width}: ${row.height}`);
          assert.ok(Math.abs(row.top - frames[0][i].top) < 1, `row jumps at ${width}`);
        });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    console.log('PASS: menu row heights and vertical positions stay stable throughout expand/collapse at four desktop widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
