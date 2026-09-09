// Live Resume AI acceptance; Diagnosis and recovery transport are explicitly intercepted fixtures.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.T5_SMOKE_URL || 'http://127.0.0.1:8770';
const out = process.env.T5_RESUME_AI_OUT || '.verification/resume-ai';
const sourcePath = path.resolve(__dirname, '../../tests/resume/fixtures/stefano-user.txt');
const raw = fs.readFileSync(sourcePath, 'utf8');
const report = {status: 'running', widths: [1440,390], checks: [], screenshots: [],
  evidence: 'Resume upload calls the configured live AI. Diagnosis, AI error and retry replay are explicit UI fixtures; no Diagnosis provider call.'};
fs.mkdirSync(out, {recursive: true});
const normalize = text => text.toLowerCase().replace(/[\s/／,，()（）._-]/g, '');
function verifyFacts(data) {
  assert.equal(data.raw_text, raw, 'original text must be byte-for-byte preserved as decoded text');
  assert.match(data.name, /斯特凡诺/); assert.match(data.name, /Stefano/i);
  for (const fact of ['大学','计算机科学与技术','学士']) assert.ok(data.education.includes(fact), 'education retains '+fact);
  const skills = normalize(data.skills.join('\n'));
  for (const skill of ['C/C++','Python','Go','SQL','Bash','Linux','MySQL','PostgreSQL','Redis','Git','Docker','FastAPI','React','TypeScript','Node.js','WebSocket']) {
    assert.ok(skills.includes(normalize(skill)), 'explicit core skill retained: '+skill);
  }
  assert.ok(data.experience.length >= 5, 'three projects plus two campus practices');
  const experiences = data.experience.join('\n');
  for (const fact of ['轻量级高性能并发 Web 服务器','分布式异步任务队列与调度中心','实时协作在线代码板','高校网络与计算中心','同伴学业导师']) {
    assert.ok(normalize(experiences).includes(normalize(fact)), 'experience retained: '+fact);
  }
  for (const fact of ['10000','12000','40','500','30%','20']) assert.ok(experiences.replaceAll(',','').includes(fact), 'quantitative fact retained: '+fact);
  const numbers = text => text.replace(/(\d),(?=\d{3}\b)/g,'$1').match(/\d+(?:\.\d+)?/g) || [];
  const sourceNumbers = new Set(numbers(raw));
  for (const number of numbers(experiences)) assert.ok(sourceNumbers.has(number), 'no new numeric fact '+number);
  assert.doesNotMatch(experiences, /荣誉奖项|ICPC.*铜奖|黑客马拉松.*二等奖/, 'awards must not become work experience');
}
async function screenshot(page, name) {
  await page.evaluate(() => scrollTo(0,0));
  const file = path.join(out,name+'.png'); await page.screenshot({path:file,fullPage:true,animations:'disabled'});
  report.screenshots.push(file);
}
async function layout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no viewport overflow');
  assert.ok(await page.locator('#module-view .button.primary:visible').count() <= 1, 'one primary action per stage');
}
async function save(page) {
  await page.locator('#resume-reviewed').check();
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/resumes') && r.request().method() === 'POST');
  await page.locator('#resume-save').click(); const result = await response; assert.equal(result.status(),201);
  const saved = await result.json(); await page.locator('#resume-next:visible').waitFor(); return saved;
}
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    for (const width of report.widths) {
      const page = await browser.newPage({viewport:{width,height:width===390?844:1000}});
      page.setDefaultTimeout(180000); const errors = []; page.on('pageerror', error => errors.push(error.message));
      // Intercept Diagnosis before any navigation can initiate a generation.
      let diagnosisCalls = 0, pair;
      await page.route('**/api/v1/diagnoses', async route => {
        diagnosisCalls++; assert.deepEqual(route.request().postDataJSON(), pair);
        await route.fulfill({status:201,json:{id:'resume-ai-ui-diagnosis',...pair,is_mock:true,
          summary:'演示数据：此结果仅验证简历识别后的页面衔接。',
          suggestions:['【岗位建议】请对照岗位核对已有技能。','【STAR】原文：维护学院计算节点。\n优化：维护学院计算节点。【待补充：实际维护范围】\n理由：只用于界面链路验收。']}});
      });
      await page.goto(base+'/#resume'); await page.locator('#resume-dropzone:enabled').waitFor();
      assert.ok(!(await page.locator('.resume-fields').isVisible()));
      const responsePromise = page.waitForResponse(r => r.url().endsWith('/resumes/upload-preview'));
      await page.locator('#resume-file').setInputFiles(sourcePath);
      await page.locator('#resume-status[data-state=busy]').waitFor();
      assert.match(await page.locator('#resume-status').innerText(), /正在用 AI 识别简历内容/);
      await screenshot(page,'ai-loading-'+width);
      const response = await responsePromise; assert.equal(response.status(),200,'live Resume AI must succeed');
      assert.notEqual(response.headers()['x-t5-mock'],'true','live AI cannot be a mock');
      const preview = await response.json(); verifyFacts(preview);
      await page.locator('#resume-status').filter({hasText:'AI 已完成结构化识别'}).waitFor();
      assert.equal(await page.locator('#resume-name').inputValue(),preview.name);
      assert.equal(await page.locator('#resume-education').inputValue(),preview.education);
      assert.deepEqual((await page.locator('#resume-skills').inputValue()).split('\n'),preview.skills);
      assert.equal(await page.locator('.resume-experience textarea').count(),preview.experience.length);
      for(let i=0;i<preview.experience.length;i++) assert.equal(await page.locator('#resume-experience-'+i).inputValue(),preview.experience[i].replace(/\r\n?/g,'\n'));
      await layout(page); await screenshot(page,'ai-review-'+width);
      const saved = await save(page); assert.equal(saved.raw_text,raw); assert.deepEqual(saved.skills,preview.skills);
      await page.locator('#resume-next').click(); await page.locator('.current-resume').waitFor();
      assert.equal(await page.locator('#module-view select').count(),0);
      await page.locator('.job-form summary').click(); await page.locator('#jobs-title').fill('AI 简历流程验收 '+width);
      await page.locator('#jobs-company').fill('显式流程验收样本'); await page.locator('#jobs-text').fill('后端开发岗位，要求 Python、SQL、Docker、FastAPI。');
      const created = page.waitForResponse(r => r.url().endsWith('/api/v1/jobs') && r.request().method()==='POST');
      await page.getByRole('button',{name:'保存并选中',exact:true}).click(); const job = await(await created).json();
      pair = {resume_id:saved.id,jd_id:job.id}; await page.locator('#jobs-run:visible:enabled').waitFor();
      await page.locator('#jobs-run').click(); await page.waitForURL('**/#matching'); await page.locator('#jobs-result:visible').waitFor();
      assert.equal(await page.locator('#module-view select').count(),0); assert.match(await page.locator('.match-score').innerText(),/\d/);
      await layout(page); await screenshot(page,'ai-to-matching-'+width);
      await page.locator('#matching-optimize').click(); await page.waitForURL('**/#diagnosis'); await page.locator('.suggestion-compare').waitFor();
      assert.equal(diagnosisCalls,1); assert.match(await page.getByTestId('diagnosis-result-mode').innerText(),/演示数据/);
      assert.equal(await page.locator('#module-view select').count(),0); await layout(page); await screenshot(page,'ai-to-diagnosis-'+width);
      // New page: an AI failure after successful extraction must retain the full original.
      const recovery = await browser.newPage({viewport:{width,height:width===390?844:1000}});
      recovery.setDefaultTimeout(30000); recovery.on('pageerror',error=>errors.push(error.message));
      await recovery.route('**/api/v1/resumes/upload-preview',route=>route.fulfill({status:503,json:{error:{message:{message:'AI 暂时无法识别这份简历，请重试。',raw_text:raw}}}}));
      await recovery.goto(base+'/#resume'); await recovery.locator('#resume-dropzone:enabled').waitFor();
      await recovery.locator('#resume-file').setInputFiles(sourcePath); await recovery.locator('#resume-ai-recovery:visible').waitFor();
      assert.equal(await recovery.locator('#resume-raw').inputValue(),raw.replace(/\r\n?/g,'\n'));
      assert.match(await recovery.locator('#resume-status').innerText(),/AI 暂时无法识别/);
      assert.ok(!(await recovery.locator('.resume-fields').isVisible())); await layout(recovery); await screenshot(recovery,'ai-failure-'+width);
      let retries=0;
      await recovery.route('**/api/v1/resumes/preview', async route => {
        retries++; assert.equal(route.request().postDataJSON().raw_text,raw);
        await route.fulfill({status:200,json:preview,headers:{'X-T5-Mock':'false'}});
      });
      await recovery.locator('#resume-ai-retry').click(); await recovery.locator('#resume-status').filter({hasText:'AI 已完成结构化识别'}).waitFor();
      assert.equal(retries,1); assert.equal(await recovery.locator('#resume-name').inputValue(),preview.name);
      // Repeat the fixture error, then choose manual fallback and save actual user-entered values.
      await recovery.locator('#resume-file').setInputFiles(sourcePath); await recovery.locator('#resume-ai-recovery:visible').waitFor();
      await recovery.locator('#resume-manual').click(); await recovery.locator('#resume-status').filter({hasText:'手动填写'}).waitFor();
      await recovery.locator('#resume-name').fill('斯特凡诺 (Stefano)'); await recovery.locator('#resume-skills').fill('Python\nSQL');
      await layout(recovery); await screenshot(recovery,'ai-manual-'+width);
      const manual = await save(recovery); assert.equal(manual.raw_text,raw); assert.deepEqual(manual.skills,['Python','SQL']);
      assert.equal(retries,1,'manual editing performs no AI request'); assert.deepEqual(errors,[]);
      report.checks.push({width,liveAI:true,name:preview.name,skillCount:preview.skills.length,experienceCount:preview.experience.length,
        facts:'name/education/core skills/three projects/two campus practices/numbers verified',
        flow:'live upload -> review -> save -> jobs -> matching -> explicit Diagnosis fixture',
        recovery:'explicit extracted-text error -> preview replay retry -> error -> manual edit/save'});
      await recovery.close(); await page.close();
    }
    report.status='passed';
  } catch(error) { report.status='failed'; report.error=error.stack; throw error; }
  finally { fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)); await browser.close(); console.log(JSON.stringify(report)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
