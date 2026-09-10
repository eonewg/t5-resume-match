// Run after restarting the ordinary application against the same fresh database.
// T5_PERSISTENCE_SNAPSHOT is a local JSON map of API paths to pre-restart responses.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8772';
  const records = JSON.parse(fs.readFileSync(process.env.T5_PERSISTENCE_SNAPSHOT, 'utf8'));
  const browser = await chromium.launch({channel:'msedge', headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  try {
    for (const [path, before] of Object.entries(records)) {
      const response = await page.request.get(base + path);
      assert.equal(response.status(), 200);
      assert.deepEqual(await response.json(), before, path + ' changed after restart');
    }
    const resume = Object.entries(records).find(([path]) => path.startsWith('/api/v1/resumes/'))[1];
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!attempt) await page.goto(base + '/#resume');
      else await page.reload();
      await page.locator('#resume-history option[value="' + resume.id + '"]').waitFor({state:'attached'});
      await page.locator('#resume-history').selectOption(resume.id);
      await page.getByRole('button',{name:'载入所选版本',exact:true}).click();
      await page.waitForFunction(expected => document.querySelector('#resume-raw')?.value === expected, resume.raw_text);
      assert.equal(await page.locator('#resume-skills').inputValue(), resume.skills.join('\n'));
      assert.equal(await page.locator('#resume-experience-0').inputValue(), resume.experience[0]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    const report = {status:'passed', persisted_records:Object.keys(records).length,
      checks:['all Resume/JD/Match/Diagnosis API records unchanged after process restart',
        'saved resume can be reloaded after full browser refresh at 1280px; raw and confirmed fields retained']};
    fs.writeFileSync('.verification/fresh-persistence-report.json', JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally {await browser.close();}
})().catch(error => {console.error(error.message);process.exitCode=1;});
