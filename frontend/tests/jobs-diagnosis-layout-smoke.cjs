// Browser layout regression using only synthetic, intercepted API responses.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const resume = { id: 'r', name: '合成演示同学', raw_text: 'Synthetic Demo Resume',
        education: '合成大学 · 计算机专业 · 本科；'.repeat(30), skills: ['Python'], experience: ['合成项目经历'] };
      const jobs = Array.from({ length: 20 }, (_, i) => ({ id: `j${i}`, title: `合成目标岗位 ${i}`,
        company: '合成演示公司', skills: ['Python', 'SQL'], tools: [], source_type: 'synthetic',
        jd_text: '合成岗位要求，仅用于布局验证。\n'.repeat(100) }));
      let diagnosisCalls = 0;
      await page.route('http://layout.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/v1/modules') return route.fulfill({ json: {} });
        if (url.pathname === '/api/v1/resumes') return route.fulfill({ json: [resume] });
        if (url.pathname === '/api/v1/resumes/r') return route.fulfill({ json: resume });
        if (url.pathname === '/api/v1/jobs') return route.fulfill({ json: jobs });
        if (url.pathname.startsWith('/api/v1/jobs/')) return route.fulfill({ json: jobs.find(j => j.id === url.pathname.split('/').pop()) });
        if (url.pathname === '/api/v1/diagnoses') {
          diagnosisCalls++;
          return route.fulfill({ json: { id: 'd', resume_id: 'r', jd_id: 'j1', is_mock: true,
            summary: '合成布局测试建议', suggestions: ['【岗位建议】核实项目中使用的技能。', '补充实际职责和证据。'] } });
        }
        if (url.pathname.startsWith('/api/')) throw Error(`Unexpected request: ${url.pathname}`);
        return route.fulfill({ path: path.join(__dirname, '../dist', url.pathname === '/' ? 'index.html' : url.pathname) });
      });
      await page.goto('http://layout.test/#/resume/history');
      await page.getByRole('button', { name: '打开所选简历' }).click();
      await page.locator('[data-module="resume"]').waitFor();
      await page.locator('[data-view="jobs"]').click();
      await page.locator('[data-job-id="j0"]:enabled').click();
      const reader = page.getByRole('region', { name: '岗位详情' });
      const list = page.getByRole('region', { name: '选择目标岗位' });
      const geometry = await page.evaluate(() => {
        const left = document.querySelector('.job-collection').getBoundingClientRect();
        const right = document.querySelector('.job-reading-pane').getBoundingClientRect();
        return { left: left.width, right: right.width, bottom: right.bottom,
          pageHeight: document.documentElement.scrollHeight, pageWidth: document.documentElement.scrollWidth };
      });
      assert.ok(geometry.right > geometry.left * 1.6, JSON.stringify(geometry));
      assert.ok(geometry.bottom <= height && geometry.pageHeight <= height, JSON.stringify(geometry));
      assert.ok(geometry.pageWidth <= width);
      await reader.hover(); await page.mouse.wheel(0, 600);
      await page.waitForFunction(() => document.querySelector('.job-reading-pane').scrollTop > 0);
      assert.equal(await list.evaluate(el => el.scrollTop), 0);
      assert.equal(await page.evaluate(() => scrollY), 0);
      const readerTop = await reader.evaluate(el => el.scrollTop);
      await list.hover(); await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => document.querySelector('.job-options').scrollTop > 0);
      assert.equal(await reader.evaluate(el => el.scrollTop), readerTop);
      await page.locator('[data-job-id="j1"]').click();
      assert.equal(await reader.evaluate(el => el.scrollTop), 0);
      await reader.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.locator('#jobs-add').click();
      const form = page.getByRole('region', { name: '添加岗位表单' });
      assert.equal(await form.evaluate(el => el.scrollTop), 0);
      assert.equal(await page.locator('.job-option[aria-pressed="true"]').count(), 0);
      await page.getByRole('button', { name: '保存并选中' }).scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => scrollY), 0);
      await page.locator('#jobs-cancel-add').click();
      await page.locator('[data-view="diagnosis"]').click();
      await page.getByTestId('diagnosis-selection').getByText(resume.name, { exact: true }).waitFor();
      const header = await page.evaluate(() => {
        const heading = document.querySelector('.diagnosis-page .page-title-row').getBoundingClientRect();
        const context = document.querySelector('.diagnosis-header').getBoundingClientRect();
        return { headingBottom: heading.bottom, contextTop: context.top, contextHeight: context.height,
          contextLeft: context.left, headingLeft: heading.left, pageWidth: document.documentElement.scrollWidth };
      });
      assert.ok(header.contextTop >= header.headingBottom, JSON.stringify(header));
      assert.ok(header.contextHeight < 160, JSON.stringify(header));
      assert.equal(header.contextLeft, header.headingLeft);
      assert.ok(header.pageWidth <= width);
      assert.equal(diagnosisCalls, 0);
      await page.locator('#diagnosis-run').click();
      await page.getByRole('region', { name: '当前建议' }).waitFor();
      const resultTop = await page.getByTestId('diagnosis-result').evaluate(el => el.getBoundingClientRect().top);
      const contextBottom = await page.locator('.diagnosis-header').evaluate(el => el.getBoundingClientRect().bottom);
      assert.ok(resultTop >= contextBottom);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(diagnosisCalls, 1);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}x${height}: jobs split scrolling, creation pane, diagnosis header and result layout`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
