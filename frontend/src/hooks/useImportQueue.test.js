import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { importQueueIdentityMatches, uploadImportFile } from './useImportQueue.js';

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.document = { cookie: 'csrf_token=queue-token', querySelector: () => null };
});

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
});

test('uploadImportFile uses postForm and returns its parsed JSON answer', async () => {
  const file = new Blob(['photo bytes'], { type: 'image/png' });
  let sent;
  const expected = { ok: true, imported: 1, failed: 0, duplicates: 0, small: 0 };

  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return new Response(JSON.stringify(expected), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const result = await uploadImportFile(
    17, 'dataset-instance', true, { key: 'queue_0', name: 'photo.png' }, file,
  );

  assert.deepEqual(result, expected);
  assert.equal(sent.url, '/api/dataset/17/import');
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers['X-CSRFToken'], 'queue-token');
  assert.equal(sent.options.body.get('csrf_token'), 'queue-token');
  assert.equal(sent.options.body.get('crop'), '1');
  assert.equal(sent.options.body.get('import_key'), 'queue_0');
  assert.equal(sent.options.body.get('dataset_instance_id'), 'dataset-instance');
  assert.equal(sent.options.body.get('files').name, 'photo.png');
});

test('uploadImportFile refuses a malformed success envelope', async () => {
  const file = new Blob(['photo bytes'], { type: 'image/png' });
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'receipt unavailable' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
  await assert.rejects(
    uploadImportFile(17, 'dataset-instance', false,
      { key: 'queue_0', name: 'photo.png' }, file),
    /receipt unavailable/,
  );
});

test('importQueueIdentityMatches rejects legacy and replacement-dataset queues', () => {
  assert.equal(importQueueIdentityMatches(
    { datasetId: '17', instanceId: 'current' }, 17, 'current',
  ), true);
  assert.equal(importQueueIdentityMatches({ datasetId: '17' }, 17, 'current'), false);
  assert.equal(importQueueIdentityMatches(
    { datasetId: '17', instanceId: 'deleted' }, 17, 'current',
  ), false);
  assert.equal(importQueueIdentityMatches(
    { datasetId: '18', instanceId: 'current' }, 17, 'current',
  ), false);
});
