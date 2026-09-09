const el = id => document.getElementById(id);
async function loadMode() {
  try {
    const response = await fetch('api/status');
    if (!response.ok) throw new Error();
    const data = await response.json();
    el('mode').textContent = data.is_mock
      ? 'Mock 离线演示 · 未调用真实模型，结果仅用于展示页面与数据结构。'
      : 'AI 诊断模式 · 点击开始后，简历与岗位文本将发送给已配置的模型服务。';
  } catch { el('mode').textContent = '无法连接服务，请检查启动状态。'; }
}
loadMode();
el('example').addEventListener('click', () => {
  el('resume').value = '数据管理专业本科生，掌握 Python、SQL。\n课程项目：使用 Python 清洗问卷数据，使用 SQL 汇总统计结果，制作可视化图表并完成小组报告。';
  el('jd').value = '数据分析实习生：使用 SQL 提取数据，使用 Python 清洗数据；参与报表制作与指标分析，需要清晰表达分析结论并与团队沟通。';
});
function list(id, values, fallback) {
  el(id).replaceChildren();
  for (const value of values.length ? values : [fallback]) {
    const item = document.createElement('li');
    item.textContent = value;
    el(id).append(item);
  }
}
el('form').addEventListener('submit', async event => {
  event.preventDefault();
  const resume_text = el('resume').value.trim(), jd_text = el('jd').value.trim();
  if (!resume_text || !jd_text) { el('status').textContent = '请填写简历与岗位描述。'; return; }
  el('submit').disabled = true;
  el('results').hidden = true;
  el('status').className = '';
  el('status').textContent = '正在分析，请稍候。模型服务异常时会进行有限重试…';
  try {
    const response = await fetch('api/diagnose', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({resume_text, jd_text})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '输入不符合要求或诊断失败，请检查后重试。');
    const result = data.result;
    el('summary').textContent = result.summary;
    el('stars').replaceChildren();
    for (const rewrite of result.star_rewrites) {
      const block = document.createElement('div');
      block.className = 'rewrite';
      block.textContent = `原文\n${rewrite.original}\n\n优化\n${rewrite.optimized}\n\n理由\n${rewrite.reason}`;
      el('stars').append(block);
    }
    if (!result.star_rewrites.length) el('stars').textContent = '暂无可改写经历，请参考下方补充提醒。';
    list('suggestions', result.jd_targeted_suggestions, '暂无建议');
    list('keywords', result.keywords_to_strengthen, '暂无额外关键词建议');
    list('risks', result.risks, '请核实所有改写事实');
    el('results').hidden = false;
    el('status').textContent = data.is_mock ? 'Mock 演示完成（未调用真实 AI）' : '诊断完成，请核实建议后修改简历。';
  } catch (error) {
    el('status').className = 'error';
    el('status').textContent = error.message || '连接失败，请重试。';
  } finally { el('submit').disabled = false; }
});
