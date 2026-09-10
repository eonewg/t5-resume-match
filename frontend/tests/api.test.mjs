import assert from "node:assert/strict";
import test from "node:test";
import { createApi, ApiError } from "../src/core/api.ts";

test("JSON requests preserve input and carry Mock provenance", async () => {
  let recorded;
  const api = createApi({ fetchImpl: async (url, options) => {
    recorded = { url, options };
    return new Response(JSON.stringify({ id: "resume_sample" }), { headers: { "X-T5-Mock": "true" } });
  } });
  const response = await api.createResume("中文\nSQL");
  assert.equal(recorded.url, "/api/v1/resumes/parse");
  assert.deepEqual(JSON.parse(recorded.options.body), { raw_text: "中文\nSQL" });
  assert.equal(response.isMock, true);
});

test("HTTP validation error becomes an actionable message", async () => {
  const api = createApi({ fetchImpl: async () => new Response(JSON.stringify({
    error: { code: "422", message: "输入不符合公共契约" },
  }), { status: 422 }) });
  await assert.rejects(api.modules(), (error) => error instanceof ApiError && error.status === 422
    && error.message === "输入不符合公共契约");
});

test("non-JSON responses are not presented as a successful result", async () => {
  const api = createApi({ fetchImpl: async () => new Response("<html>error</html>", { status: 502 }) });
  await assert.rejects(api.modules(), /无法读取/);
});

test("requests are aborted after their configured deadline", async () => {
  const api = createApi({ timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }) });
  await assert.rejects(api.modules(), /请求超时/);
});

test("API facade rejects external destinations", async () => {
  const api = createApi({ fetchImpl: () => { throw new Error("must not fetch"); } });
  for (const path of ["https://example.com", "//example.com", "/\\example.com"]) {
    await assert.rejects(api.request(path), /当前服务/);
  }
});

test("diagnosis and workflow can finish beyond the normal deadline and still have a bound", async () => {
  const api = createApi({ timeoutMs: 5, diagnosisTimeoutMs: 1000, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify({ is_mock: false }))), 25);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
  }) });
  await assert.rejects(api.modules(), /请求超时/);
  assert.equal((await api.workflow({ resume_id: "r", jd_id: "j" })).data.is_mock, false);
  assert.equal((await api.request("/api/v1/diagnoses", { method: "POST", body: {} })).data.is_mock, false);
  assert.equal((await api.request("/api/v1/matches/m/assessment", { method: "POST" })).data.is_mock, false);
  const slow = createApi({ diagnosisTimeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }) });
  await assert.rejects(slow.workflow({}), /请求超时/);
  await assert.rejects(slow.request('/api/v1/matches/m/assessment', { method: 'POST' }), /请求超时/);
});

test('Resume AI upload failure exposes original text only on its own route', async () => {
  const raw = '  原文\r\nPython  ';
  const api = createApi({fetchImpl: async () => new Response(JSON.stringify({error: {
    message: {message: 'AI 识别超时', code: 'timeout', raw_text: raw},
  }}), {status: 504})});
  await assert.rejects(api.request('/api/v1/resumes/upload-preview', {method: 'POST'}), error =>
    error instanceof ApiError && error.message === 'AI 识别超时' && error.rawText === raw);
  await assert.rejects(api.request('/api/v1/jobs'), error => error.rawText === undefined);
});

test('Resume AI has an independent bounded deadline', async () => {
  const fetchImpl = (_, {signal}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response('{}')), 25);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(Error('aborted')); }, {once: true});
  });
  const api = createApi({timeoutMs: 5, resumeTimeoutMs: 1000, fetchImpl});
  for (const path of ['preview', 'upload-preview', 'parse']) {
    assert.deepEqual((await api.request('/api/v1/resumes/' + path, {method: 'POST'})).data, {});
  }
  await assert.rejects(api.request('/api/v1/resumes', {method: 'POST'}), /请求超时/);
  await assert.rejects(createApi({resumeTimeoutMs: 5, fetchImpl}).request('/api/v1/resumes/preview', {method: 'POST'}), /请求超时/);
});
