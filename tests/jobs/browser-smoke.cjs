// Run public app on 8768 with real JobsService; other providers may remain Mock.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:950}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const saved=await page.request.post('http://127.0.0.1:8768/api/v1/resumes',{data:{name:'合成测试简历',skills:['Python'],raw_text:'使用 Python 处理课程数据。'}});
    const resume=await saved.json();assert.equal(saved.status(),201);
    await page.goto('http://127.0.0.1:8768/?preview=jobs#jobs');
    await page.locator('#jobs-status').filter({hasText:'已加载'}).waitFor();
    const match=page.getByRole('button',{name:'计算匹配',exact:true});
    await match.click();await page.locator('#jobs-status').filter({hasText:'请选择'}).waitFor();
    await page.locator('#jobs-title').fill('数据实习生');
    await page.locator('#jobs-text').fill('要求 Python、SQL、Docker。\n薪资：CNY 10-15K/月');
    await page.getByRole('button',{name:'解析并保存 JD'}).click();
    await page.locator('#jobs-status').filter({hasText:'JD 已解析并保存'}).waitFor();
    assert.match(await page.locator('#jobs-keywords').innerText(),/Docker.*Python.*SQL/);
    assert.match(await page.locator('#jobs-tools').innerText(),/Docker.*Python.*SQL/);
    assert.match(await page.locator('#jobs-salary').innerText(),/10000–15000 CNY \/ month/);
    await page.locator('#jobs-resume').selectOption(resume.id);
    await match.click();await page.locator('#jobs-result:not([hidden])').waitFor();
    if (process.env.T5_SMOKE_SEMANTIC === '1') {
      assert.match(await page.locator('#jobs-result').innerText(),/语义增强：关键词分 33.33/);
      assert.match(await page.locator('#jobs-result').innerText(),/cosine=/);
    } else {
      assert.match(await page.locator('#jobs-result').innerText(),/33.33%/);
      assert.match(await page.locator('#jobs-result').innerText(),/1\/3/);
    }
    await page.route('**/api/v1/matches',r=>r.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:{message:'测试服务失败'}})}));
    await match.click();await page.locator('#jobs-status').filter({hasText:'测试服务失败'}).waitFor();
    assert.equal(await page.locator('#jobs-result').isVisible(),false);assert.equal(await match.isEnabled(),true);
    await page.unroute('**/api/v1/matches');await match.click();await page.locator('#jobs-result:not([hidden])').waitFor();
    const desktop=path.join(os.tmpdir(),'t5-jobs-desktop.png');await page.screenshot({path:desktop,fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const mobile=path.join(os.tmpdir(),'t5-jobs-mobile.png');await page.screenshot({path:mobile,fullPage:true});
    await page.route('**/api/v1/matches',async route=>{
      const response=await route.fetch();const data=await response.json();data.gap_analysis=['<img src=x onerror="window.injected=true">'+'很长的解释'.repeat(500)];
      data.is_mock=true;await route.fulfill({json:data});
    });
    await match.click();await page.locator('#jobs-result:not([hidden])').waitFor();
    assert.match(await page.locator('#jobs-result').innerText(),/Mock/);
    assert.equal(await page.locator('#jobs-result img').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.unroute('**/api/v1/matches');
    for(let i=0;i<3;i++){
      await page.locator('[data-view="diagnosis"]').click();await page.locator('[data-view="jobs"]').click();
      await page.locator('#jobs-status').filter({hasText:'已加载'}).waitFor();
    }
    let posts=0;page.on('request',r=>{if(r.url().endsWith('/api/v1/matches')&&r.method()==='POST')posts++;});
    await match.click();await page.locator('#jobs-result:not([hidden])').waitFor();assert.equal(posts,1);
    if (process.env.T5_SMOKE_SEMANTIC === '1') {
      await page.locator('#jobs-title').fill('过滤验证岗位');
      await page.locator('#jobs-text').fill('无需 Docker。要求 Kubernetes。');
      await page.getByRole('button',{name:'解析并保存 JD'}).click();
      await page.locator('#jobs-status').filter({hasText:'JD 已解析并保存'}).waitFor();
      assert.match(await page.locator('#jobs-keywords').innerText(),/Kubernetes/);
      assert.doesNotMatch(await page.locator('#jobs-keywords').innerText(),/Docker/);
      const intentResponse=await page.request.post('http://127.0.0.1:8768/api/v1/resumes',{data:{raw_text:'正在学习 Kubernetes',experience:['正在学习 Kubernetes'],skills:[]}});
      assert.equal(intentResponse.status(),201); const intent=await intentResponse.json();
      await page.getByRole('button',{name:'刷新已保存记录'}).click();
      await page.locator('#jobs-status').filter({hasText:'已加载'}).waitFor();
      await page.locator('#jobs-resume').selectOption(intent.id);
      await match.click();await page.locator('#jobs-result:not([hidden])').waitFor();
      assert.match(await page.locator('#jobs-result').innerText(),/过滤/);
      assert.match(await page.locator('#jobs-result h2').innerText(),/^0%/);
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',desktop,mobile,
      checks:['empty','JD save/parse','selection',process.env.T5_SMOKE_SEMANTIC === '1' ? 'real semantic blend/evidence' : '33.33 keyword score/gap','failure/retry','Mock','XSS/long text','390px','navigation cleanup']}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
