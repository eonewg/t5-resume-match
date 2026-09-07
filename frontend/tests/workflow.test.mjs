import assert from "node:assert/strict";
import test from "node:test";
import { runWorkflow } from "../src/core/workflow.js";
import { createWorkspace } from "../src/core/workspace.js";

const input = { resumeText: " Python ", title: " 分析师 ", company: "", jdText: " SQL " };

test("workflow uses returned IDs and propagates upstream Mock provenance", async () => {
  const calls = [];
  const api = {
    createResume: async (text) => { calls.push(text); return { data: { id: "resume_new" }, isMock: true }; },
    createJob: async (data) => { calls.push(data); return { data: { id: "jd_new" }, isMock: false }; },
    workflow: async (pair) => { calls.push(pair); return { data: {
      match: { is_mock: false }, diagnosis: { is_mock: false },
    } }; },
  };
  const result = await runWorkflow(api, input);
  assert.deepEqual(calls, ["Python", { title: "分析师", company: null, jd_text: "SQL" },
    { resume_id: "resume_new", jd_id: "jd_new" }]);
  assert.equal(result.isMock, true);
});

test("workflow stops when resume creation fails", async () => {
  let downstream = false;
  const api = {
    createResume: async () => { throw new Error("parse failed"); },
    createJob: async () => { downstream = true; },
  };
  await assert.rejects(runWorkflow(api, input), /parse failed/);
  assert.equal(downstream, false);
});

test("whitespace input does not create records", async () => {
  await assert.rejects(runWorkflow({}, { ...input, title: "  " }), /请填写/);
});

test("missing IDs stop the workflow before sending a broken pair", async () => {
  await assert.rejects(runWorkflow({ createResume: async () => ({ data: {} }) }, input), /有效编号/);
});

test("workspace subscriptions are disposable and snapshots are isolated", () => {
  const workspace = createWorkspace();
  let count = 0;
  const unsubscribe = workspace.subscribe(() => { count++; });
  workspace.updateSelection({ resumeId: "r1", result: { value: 1 } });
  const snapshot = workspace.getState();
  snapshot.result.value = 2;
  assert.equal(workspace.getState().result.value, 1);
  unsubscribe();
  workspace.updateSelection({ resumeId: "r2" });
  assert.equal(count, 1);
});
