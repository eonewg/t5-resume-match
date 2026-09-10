import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspace } from "../src/core/state.ts";

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

test("changing the resume or job selection clears a stale result", () => {
  const workspace = createWorkspace();
  workspace.updateSelection({ resumeId: "r1", jdId: "j1", result: { match: { score: 50 } } });
  assert.equal(workspace.getState().result.match.score, 50);
  workspace.updateSelection({ jdId: "j2" });
  assert.equal(workspace.getState().result, null);
});

test('successful pair results restore within 30 minutes and expire without carrying run intent', () => {
  let now = 0;
  const workspace = createWorkspace({now: () => now});
  workspace.updateSelection({resumeId:'r1',jdId:'j1'});
  workspace.updateSelection({result:{match:{resume_id:'r1',jd_id:'j1',score:50,is_mock:false,ai_assessment:{score:65}},diagnosis:{resume_id:'r1',jd_id:'j1',summary:'saved',is_mock:false},diagnosisRequested:true}});
  workspace.updateSelection({jdId:'j2'});
  assert.equal(workspace.getState().result,null);
  workspace.updateSelection({jdId:'j1'});
  assert.equal(workspace.getState().result.match.ai_assessment.score,65);
  assert.equal(workspace.getState().result.diagnosis.summary,'saved');
  assert.equal(workspace.getState().result.diagnosisRequested,undefined);
  workspace.updateSelection({resumeId:'r2'});
  assert.equal(workspace.getState().result,null);
  now = 30*60*1000;
  workspace.updateSelection({resumeId:'r1'});
  assert.equal(workspace.getState().result,null);
});
