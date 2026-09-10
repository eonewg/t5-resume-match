// Long, explicitly synthetic output verifies layout without a model call or user data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.T5_SMOKE_URL;
const out = path.join(process.env.T5_SMOKE_OUT, 'diagnosis-layout');
fs.mkdirSync(out, { recursive: true });
async function post(route, body) {
  const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.ok(response.ok); return response.json();
}
const original = '针对课程网络服务的数据库写入压力，引入 Redis Stream 作为异步缓冲队列，设计批量聚合落库机制，并通过日志核对处理结果。';
const keywords = ['微服务架构设计', '高并发系统', '容量规划', '容灾演练', '高可用方案', '自研网络通信框架', '分布式缓存', '数据存储引擎', '线上故障定位', 'gdb/perf/valgrind', 'SQL 优化', 'Linux', '网络 I/O', 'MySQL', 'Redis', '缓存一致性'];
const suggestions = [
  ...Array.from({ length: 3 }, (_, i) => `【STAR】原文：${original} 第 ${i+1} 个合成项目。\n优化：在第 ${i+1} 个课程项目中，针对写入压力引入异步缓冲队列，设计批量聚合落库机制并核对处理结果。【待补充：实际测试规模与观测结果】\n理由：说明问题与个人行动，实际效果仍需用真实证据补充。`),
  ...Array.from({ length: 10 }, (_, i) => i < 5
    ? `【岗位建议】在相关项目中说明${keywords[i]}的个人工作\n合成样本中的项目描述只列出技术名称。请补充你实际负责的范围和方案选择依据，未参与的内容不必补写。`
    : `【岗位建议】JD 要求${keywords[i]}，简历目前只列出了工具名称，若确实参与过相关工作，可以补充个人负责的部分；没做过的作为学习方向。`),
  ...keywords.map(k => '【关键词·待核实】' + k),
  ...Array.from({ length: 10 }, (_, i) => `【风险提醒】第 ${i+1} 项核实：确认项目规模、个人职责与成果来自真实记录；未提供的数据应保留待补充标记，避免把计划写成已完成经历。`),
];
(async () => {
  await post('/api/v1/resumes', { name: 'Synthetic Demo Resume', raw_text: '合成布局测试', education: '计算机科学本科', skills: ['C++', 'Redis'], experience: [original] });
  const job = await post('/api/v1/jobs', { title: 'Synthetic Demo C++ Job', jd_text: '要求 C++、Redis 和网络服务开发经历。', source_type: 'synthetic' });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1280, 1440, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      let calls = 0;
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/v1/diagnoses', route => {
        calls++;
        return route.fulfill({ json: { ...route.request().postDataJSON(), id: 'layout-fixture', is_mock: true,
          summary: '合成布局样本：已有后端开发和课程项目经验。请先核对经历改写，再对照岗位建议选择可补充的真实证据；待核实关键词只表示需要确认，不代表已掌握。', suggestions } });
      });
      await page.goto(base + '/#/resume/history');
      await page.getByRole('button', { name: '打开简历 →', exact: true }).first().click();
      await page.locator('#resume-next').click();
      await page.locator(`[data-job-id="${job.id}"]`).click();
      await page.locator('#jobs-run').click();
      await page.locator('#matching-optimize').click();
      await page.locator('.suggestion-reader').waitFor();
      assert.ok((await page.locator('.suggestion-index').boundingBox()).height < 300, 'three short index rows');
      await page.locator('.suggestion-index button').last().click();
      assert.match(await page.locator('.suggestion-reader').innerText(), /第 3 个/);
      assert.equal(await page.getByRole('button', {name: /补充与核实/}).count(), 0);
      assert.equal(await page.locator('.suggestion-reminders').evaluate(el => el.open), false);
      for (const [name, tag] of [['经历表达', 'experience'], ['岗位重点', 'jobs']]) {
        await page.getByRole('button', { name: new RegExp(name) }).click();
        if (tag === 'jobs') {
          assert.equal(await page.locator('ol.suggestion-list > li').count(), 10);
          assert.equal(await page.locator('.suggestion-index').count(), 0);
          assert.equal(await page.locator('.job-actions details[open]').count(), 0);
          assert.ok((await page.locator('.job-actions').boundingBox()).height < 950);
          const first = page.locator('.job-actions details').first();
          await first.locator('summary').click();
          assert.match(await first.innerText(), /合成样本中的项目描述/);
          await first.locator('summary').click();
          assert.equal(await page.locator('.suggestion-keywords').evaluate(el => el.open), false);
        }
        await page.evaluate(() => scrollTo(0, 0));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
        await page.screenshot({ path: path.join(out, `${tag}-${width}.png`), fullPage: true });
      }
      await page.locator('.suggestion-keywords summary').click();
      await page.locator('.suggestion-reminders summary').click();
      assert.equal(await page.locator('.suggestion-keywords li:visible').count(), 16);
      assert.equal(await page.locator('.suggestion-reminders li:visible').count(), 10);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(out, `supplements-${width}.png`), fullPage: true });
      assert.equal(calls, 1, 'category navigation never reruns AI');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: 1280/1440/1920px; two categories, supplements collapsed by default, all content accessible, no overflow or extra AI calls.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
