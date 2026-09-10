import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsPath, connectAnalytics, initialFilters, recentDates } from './controller.ts';

function setup(request) {
  let state;
  const abort = new AbortController();
  const controller = connectAnalytics({ api: { request }, signal: abort.signal }, (value) => {
    state = value;
  });
  return { controller, state: () => state, abort };
}
const response = (label) => ({ data: { summary: label, is_mock: false, market: null } });

test('default analysis includes manually recorded jobs without requiring a real-source label', async () => {
  const calls = [];
  const f = setup(async (path) => {
    calls.push(path);
    return response('recorded');
  });
  await f.controller.load();
  assert.deepEqual(initialFilters(), { source_type: '', date_from: '', date_to: '' });
  assert.deepEqual(calls, ['/api/v1/analytics']);
});

test('recent ranges use inclusive local calendar days and can clear date limits', () => {
  assert.deepEqual(recentDates(30, new Date(2026, 8, 10)), {
    date_from: '2026-08-12',
    date_to: '2026-09-10',
  });
  assert.deepEqual(recentDates(30, new Date(2024, 2, 1)), {
    date_from: '2024-02-01',
    date_to: '2024-03-01',
  });
  assert.deepEqual(recentDates(0), { date_from: '', date_to: '' });
});

test('global source and date filters are encoded in a single analytics request', () => {
  assert.equal(
    analyticsPath({ source_type: 'real', date_from: '2026-09-01', date_to: '2026-09-08' }),
    '/api/v1/analytics?source_type=real&date_from=2026-09-01&date_to=2026-09-08',
  );
  assert.equal(analyticsPath({}), '/api/v1/analytics');
});

test('latest filter response wins; errors remove stale charts and retry works', async () => {
  const pending = [];
  const f = setup(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const old = f.controller.load({ source_type: 'real' }),
    latest = f.controller.load({ source_type: 'synthetic' });
  pending[1].resolve(response('latest'));
  await latest;
  pending[0].resolve(response('old'));
  await old;
  assert.equal(f.state().result.summary, 'latest');
  const failed = f.controller.load();
  pending[2].reject(Error('offline'));
  await failed;
  assert.equal(f.state().result, null);
  assert.equal(f.state().error, 'offline');
  const retry = f.controller.load();
  pending[3].resolve(response('recovered'));
  await retry;
  assert.equal(f.state().result.summary, 'recovered');
});

test('invalid dates fail before network; abort suppresses late data', async () => {
  let calls = 0,
    resolve;
  const f = setup(() => {
    calls++;
    return new Promise((r) => {
      resolve = r;
    });
  });
  await f.controller.load({ date_from: '2026-09-08', date_to: '2026-09-07' });
  assert.equal(calls, 0);
  assert.match(f.state().error, /起点/);
  const work = f.controller.load({ source_type: 'real' });
  f.abort.abort();
  resolve(response('late'));
  await work;
  assert.equal(f.state().result, null);
});

test('explicit snapshot import refreshes saved jobs and is not repeated while pending', async () => {
  const calls = [];
  let complete;
  const f = setup((path, options) => {
    calls.push({ path, options });
    return path.endsWith('sample-jobs')
      ? new Promise((r) => {
          complete = r;
        })
      : Promise.resolve(response('real snapshots'));
  });
  const work = f.controller.importSamples();
  await f.controller.importSamples();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  complete({ data: { created: 5, existing: 0 } });
  await work;
  assert.equal(calls[1].path, '/api/v1/analytics');
  assert.match(f.state().notice, /新增 5 条/);
});

test('Mock response provenance remains explicit', async () => {
  const f = setup(async () => ({ ...response('fixture'), isMock: true }));
  await f.controller.load();
  assert.equal(f.state().result.is_mock, true);
});

test('external import is explicit, deduplicates in-flight clicks, and preserves charts on failure', async () => {
  const calls = [];
  let finish;
  const f = setup((path, options) => {
    calls.push({ path, options });
    return path.endsWith('external-jobs')
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(response('saved'));
  });
  await f.controller.load();
  const work = f.controller.importExternal();
  await f.controller.importExternal();
  assert.equal(calls.filter((c) => c.path.endsWith('external-jobs')).length, 1);
  finish({ data: { created: 5, existing: 3, skipped: 1, cached: true, fetched_at: '2026-09-10' } });
  await work;
  assert.match(f.state().notice, /新增 5 条/);
  assert.match(f.state().notice, /已有 3 条/);
  const broken = setup(async (path) => {
    if (path.endsWith('external-jobs')) throw Error('offline');
    return response('saved');
  });
  await broken.controller.load();
  await broken.controller.importExternal();
  assert.equal(broken.state().result.summary, 'saved');
  assert.equal(broken.state().error, 'offline');
});
