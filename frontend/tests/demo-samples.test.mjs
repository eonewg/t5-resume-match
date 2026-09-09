import test from 'node:test';
import assert from 'node:assert/strict';
import resume from '../src/demo/fixtures/resume-zh.ts';
import cpp from '../src/demo/fixtures/job-cpp.ts';
import go from '../src/demo/fixtures/job-go.ts';
import ml from '../src/demo/fixtures/job-ml.ts';
test('four local fixtures explicitly identify synthetic content and retain resume details', () => {
  assert.match(resume, /合成演示简历 \/ Synthetic Demo Resume/);
  for (const sample of [cpp, go, ml]) {
    assert.match(sample.text, /合成演示岗位/);
    assert.match(sample.text, /不对应真实公司或真实招聘信息/);
    assert.ok(sample.text.includes(sample.title));
  }
  for (const detail of ['张浩然', 'github.com/haoran-zhang', 'tRPC-Cpp', 'Redis Stream', 'Read-Index', 'Lease Read', '110,000+', '99.99%', 'CET-6 590']) assert.ok(resume.includes(detail));
  assert.doesNotMatch(resume, /google\.com|需要将这份简历的技术栈/);
  assert.match(go.text, /Kubernetes/); assert.match(ml.text, /PyTorch/);
});
