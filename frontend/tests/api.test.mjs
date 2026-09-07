import assert from "node:assert/strict";
import test from "node:test";
import { createApi, ApiError } from "../src/core/api.js";

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
