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
