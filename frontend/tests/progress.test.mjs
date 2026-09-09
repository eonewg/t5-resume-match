import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspace, nextStep} from '../src/core/state.ts';

test('dashboard advances only on the current confirmed pair and validated results', () => {
  const store = createWorkspace();
  assert.equal(nextStep(store.getState()), 0);
  store.updateSelection({resumeId: 'r'}); assert.equal(nextStep(store.getState()), 1);
  store.updateSelection({jdId: 'j'}); assert.equal(nextStep(store.getState()), 2);
  store.updateSelection({result: {match: {resume_id: 'r', jd_id: 'j'}}}); assert.equal(nextStep(store.getState()), 3);
  store.updateSelection({result: {...store.getState().result, diagnosis: {resume_id: 'r', jd_id: 'j'}}}); assert.equal(nextStep(store.getState()), 4);
  store.updateSelection({jdId: 'other'}); assert.equal(nextStep(store.getState()), 2); assert.equal(store.getState().result, null);
});
test('old results never complete the dashboard for a different pair', () => {
  assert.equal(nextStep({resumeId: 'r', jdId: 'j', result: {match: {resume_id: 'old', jd_id: 'j'}}}), 2);
});
