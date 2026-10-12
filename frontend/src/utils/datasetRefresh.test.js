import assert from 'node:assert/strict';
import test from 'node:test';

import { refreshDatasetIfActive } from './datasetRefresh.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('an older refresh for the same dataset cannot overwrite the latest verdict', async () => {
  const old = deferred();
  let sequence = 1;
  let data = null;
  const options = {
    datasetId: 7, getActiveDatasetId: () => 7,
    commitData: (next) => { data = next; }, clearActiveDataset: () => {},
  };
  const first = refreshDatasetIfActive({ ...options, request: () => old.promise,
    isCurrentRequest: () => sequence === 1 });
  sequence = 2;
  await refreshDatasetIfActive({ ...options,
    request: async () => ({ ok: true, json: async () => ({ status: 'keep' }) }),
    isCurrentRequest: () => sequence === 2 });
  old.resolve({ ok: true, json: async () => ({ status: 'pending' }) });
  assert.equal((await first).status, 'stale');
  assert.deepEqual(data, { status: 'keep' });
});

test('an older same-dataset 404 cannot close a newer successful refresh', async () => {
  const old = deferred();
  let current = true;
  let clears = 0;
  const pending = refreshDatasetIfActive({ datasetId: 7, getActiveDatasetId: () => 7,
    request: () => old.promise, commitData: () => { clears += 1; },
    clearActiveDataset: () => { clears += 1; }, isCurrentRequest: () => current });
  current = false;
  old.resolve({ ok: false, status: 404 });
  assert.equal((await pending).status, 'stale');
  assert.equal(clears, 0);
});

test('pending refresh A is ignored after opening dataset B', async () => {
  const response = deferred();
  let activeId = 1;
  let data = { id: 1, name: 'A before refresh' };
  const open = (id, payload) => {
    activeId = id;
    data = payload;
  };

  const pendingRefresh = refreshDatasetIfActive({
    datasetId: 1,
    getActiveDatasetId: () => activeId,
    request: () => response.promise,
    commitData: (next) => { data = next; },
    clearActiveDataset: () => { activeId = null; },
  });

  open(2, { id: 2, name: 'B' });
  response.resolve({ ok: true, status: 200, json: async () => ({ id: 1, name: 'late A' }) });

  assert.deepEqual(await pendingRefresh, { status: 'stale' });
  assert.deepEqual(data, { id: 2, name: 'B' });
  assert.equal(activeId, 2);
});

test('a stale 404 cannot close the newly active dataset', async () => {
  const response = deferred();
  let activeId = 1;
  let data = { id: 1 };
  let clears = 0;

  const pendingRefresh = refreshDatasetIfActive({
    datasetId: 1,
    getActiveDatasetId: () => activeId,
    request: () => response.promise,
    commitData: (next) => { data = next; },
    clearActiveDataset: () => { clears += 1; activeId = null; },
  });

  activeId = 2;
  data = { id: 2 };
  response.resolve({ ok: false, status: 404 });

  assert.deepEqual(await pendingRefresh, { status: 'stale' });
  assert.deepEqual(data, { id: 2 });
  assert.equal(activeId, 2);
  assert.equal(clears, 0);
});

test('the active dataset still commits normally', async () => {
  let data = null;
  const result = await refreshDatasetIfActive({
    datasetId: 7,
    getActiveDatasetId: () => 7,
    request: async () => ({ ok: true, status: 200, json: async () => ({ id: 7 }) }),
    commitData: (next) => { data = next; },
    clearActiveDataset: () => {},
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(data, { id: 7 });
});
