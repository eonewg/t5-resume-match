const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.T5_SETTINGS_SMOKE_URL || 'http://127.0.0.1:8772';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const initial = await (await page.request.get(base + '/api/v1/settings/ai')).json();
    assert.ok(
      Object.values(initial.modules).every((m) => m.base_url.includes('fixture.example.test')),
      'requires isolated synthetic settings server',
    );
    await page.goto(base);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.ai-provider-list').waitFor();
    await page.getByRole('button', { name: '新建配置', exact: true }).click();
    await page.locator('#ai-base-url').fill('https://fixture.example.test/v1');
    await page.locator('#ai-profile-name').fill('供应商 A');
    await page.locator('#ai-model').fill('synthetic-model-a');
    await page.locator('#ai-api-key').fill('synthetic-key-a');
    await page.getByRole('button', { name: '保存配置', exact: true }).click();
    await page.getByText(/供应商配置已保存/).waitFor();
    for (const name of ['简历识别', '匹配分析', 'AI 优化']) {
      await page
        .getByRole('article', { name: '供应商 A', exact: true })
        .getByRole('checkbox', { name, exact: true })
        .check();
      await page
        .getByRole('button', { name: '新建配置', exact: true })
        .waitFor({ state: 'visible' });
      await page.waitForFunction(
        () => !document.querySelector('.ai-provider-toolbar button').disabled,
      );
    }
    let state = await (await page.request.get(base + '/api/v1/settings/ai')).json();
    const a = state.modules.resume.profile_id;
    await page.getByRole('button', { name: '新建配置', exact: true }).click();
    await page.locator('#ai-profile-name').fill('供应商 B');
    await page.locator('#ai-base-url').fill('https://fixture.example.test/v1');
    await page.locator('#ai-model').fill('synthetic-model-b');
    await page.locator('#ai-api-key').fill('synthetic-key-b');
    await page.getByRole('button', { name: '保存配置', exact: true }).click();
    await page.getByText(/供应商配置已保存/).waitFor();
    state = await (await page.request.get(base + '/api/v1/settings/ai')).json();
    assert.ok(Object.values(state.modules).every((m) => m.profile_id === a));
    const b = state.profiles.find((p) => p.name === '供应商 B').id;
    assert.notEqual(a, b);
    await page
      .getByRole('article', { name: '供应商 B', exact: true })
      .getByRole('checkbox', { name: '简历识别', exact: true })
      .check();
    await page.getByText(/已切换供应商/).waitFor();
    state = await (await page.request.get(base + '/api/v1/settings/ai')).json();
    assert.equal(state.modules.resume.profile_id, b);
    assert.equal(state.modules.matching.profile_id, a);
    await page
      .getByRole('article', { name: '供应商 B', exact: true })
      .getByRole('button', { name: '编辑', exact: true })
      .click();
    await page.getByRole('button', { name: '显示 API Key', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('#ai-api-key').value === 'synthetic-key-b',
    );
    assert.equal(await page.locator('#ai-api-key').inputValue(), 'synthetic-key-b');
    assert.equal(await page.locator('#ai-api-key').getAttribute('type'), 'text');
    await page.getByRole('button', { name: '隐藏 API Key', exact: true }).click();
    assert.equal(await page.locator('#ai-api-key').getAttribute('type'), 'password');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await page.getByText('连接成功', { exact: true }).waitFor();
    for (const width of [1920, 1440, 1366, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.locator('.ai-provider-list').waitFor();
      assert.equal(await page.locator('#ai-api-key').count(), 0);
      assert.ok(
        await page
          .getByRole('article', { name: '供应商 B', exact: true })
          .getByRole('checkbox', { name: '简历识别', exact: true })
          .isChecked(),
      );
      assert.ok(
        await page.locator('dialog').evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.left >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight &&
            e.scrollWidth <= e.clientWidth
          );
        }),
      );
      await page.screenshot({ path: '.verification/ai-profiles-' + width + '.png' });
    }
    await page.getByText('更多操作', { exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '保存并退出', exact: true }).click();
    await page.getByRole('heading', { name: '配置已保存' }).waitFor();
    assert.equal(await page.locator('#ai-api-key').count(), 0);
    let stopped = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      try {
        await page.request.get(base + '/health', { timeout: 500 });
      } catch {
        stopped = true;
        break;
      }
    }
    assert.ok(stopped, 'server must actually stop listening after save and exit');
    assert.deepEqual(errors, []);
    console.log(
      'PASS supplier A/B retained, per-module switch, key reveal/hide/clear, synthetic upstream probe, four desktop sizes, real save-and-exit stops server.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
