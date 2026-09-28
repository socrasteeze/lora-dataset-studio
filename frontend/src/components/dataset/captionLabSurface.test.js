import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./captionLabSurface.js', import.meta.url), 'utf8');

test('dataset caption drafts use the dataset instance UUID, never reusable numeric IDs', () => {
  assert.match(source, /draftKey: instanceId && filename/);
  assert.match(source, /`dataset:\$\{instanceId\}:\$\{imageId\}:\$\{encodeURIComponent\(filename\)\}`/);
  assert.doesNotMatch(source, /draftKey: `dataset:\$\{datasetId\}:\$\{imageId\}`/);
});

test('Bank caption drafts require persistent bank and image instance IDs', () => {
  assert.match(source, /draftKey: bankInstanceId && imageInstanceId/);
  assert.match(source, /`bank:\$\{bankInstanceId\}:\$\{imageInstanceId\}`/);
  assert.doesNotMatch(source, /draftKey: `bank:\$\{bankId\}:\$\{imageId\}`/);
});
