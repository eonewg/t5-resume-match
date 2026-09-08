import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleSlots} from '../src/core/modules.js';

test('Jobs default navigation loads the reviewed module without preview', async () => {
  assert.equal(typeof moduleSlots.jobs.load, 'function');
  const module = await moduleSlots.jobs.load();
  assert.equal(typeof module.mount, 'function');
});
