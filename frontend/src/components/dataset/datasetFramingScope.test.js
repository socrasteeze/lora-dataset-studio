import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetFramingScope } from './datasetFramingScope.js';
import { passScopeCount } from '../bank/bankPassScope.js';

const images = [
  { id: 1, filename: 'example-1.png', status: 'keep', framing: 'face' },
  { id: 2, filename: 'example-2.png', status: 'pending', framing: null },
  { id: 3, filename: 'example-3.png', status: 'reject', framing: 'body' },
  { id: 4, filename: '', status: 'keep', framing: null },
];

test('Auto-Crop counts classified files but excludes the bin by default', () => {
  const { payload, statuses } = datasetFramingScope(images);
  assert.equal(passScopeCount(payload, 'framing', '', true), 2);
  assert.equal(passScopeCount(payload, 'framing', '', false), 1);
  assert.equal(statuses, null);
});

test('explicit bin and whole-dataset scopes use the shared Bank definitions', () => {
  const rejected = datasetFramingScope(images, [], 'reject');
  assert.deepEqual(rejected.statuses, ['reject']);
  assert.equal(passScopeCount(rejected.payload, 'framing', 'reject', true), 1);
  const all = datasetFramingScope(images, [], 'all');
  assert.deepEqual(all.statuses, ['keep', 'pending', 'reject']);
  assert.equal(passScopeCount(all.payload, 'framing', 'all', true), 3);
});

test('a grid selection never includes rejected, foreign, missing-file or stale IDs', () => {
  const { imageIds } = datasetFramingScope(images, [1, 2, 3, 4, 999, 1], 'all');
  assert.deepEqual(imageIds, [1, 2]);
  assert.deepEqual(datasetFramingScope(images, [3, 999]).imageIds, []);
});
