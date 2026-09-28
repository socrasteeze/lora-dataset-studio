import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCaptionDraft, readCaptionDraft, writeCaptionDraft } from './captionDraft.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
const base = { caption: 'A red coat.', short: 'red coat' };
const edited = { caption: 'A blue coat.', short: 'blue coat' };

test('long and short edits are recovered after reopening the same image', () => {
  const storage = memoryStorage();
  assert.equal(writeCaptionDraft(storage, 'dataset:1:2', base, edited), true);
  assert.deepEqual(readCaptionDraft(storage, 'dataset:1:2', base),
    { ...edited, recovered: true, conflict: null });
});

test('Bank and Dataset drafts cannot collide when IDs match', () => {
  const storage = memoryStorage();
  writeCaptionDraft(storage, 'bank:1:2', base, edited);
  assert.deepEqual(readCaptionDraft(storage, 'dataset:1:2', base),
    { ...base, recovered: false, conflict: null });
});

test('a server-side change needs an explicit recovery decision', () => {
  const storage = memoryStorage();
  writeCaptionDraft(storage, 'dataset:1:2', base, edited);
  const current = { ...base, caption: 'A green coat.' };
  const result = readCaptionDraft(storage, 'dataset:1:2', current);
  assert.equal(result.caption, current.caption);
  assert.equal(result.recovered, false);
  assert.deepEqual(result.conflict, { version: 1, base, ...edited });
});

test('a completed save cannot resurrect the old local draft', () => {
  const storage = memoryStorage();
  writeCaptionDraft(storage, 'dataset:1:2', base, edited);
  assert.deepEqual(readCaptionDraft(storage, 'dataset:1:2', edited),
    { ...edited, recovered: false, conflict: null });
  assert.equal(storage.getItem('lds:caption-draft:dataset:1:2'), null);
});

test('reverting or explicitly discarding removes recovery data', () => {
  const storage = memoryStorage();
  writeCaptionDraft(storage, 'dataset:1:2', base, edited);
  writeCaptionDraft(storage, 'dataset:1:2', base, base);
  assert.equal(readCaptionDraft(storage, 'dataset:1:2', base).recovered, false);
  writeCaptionDraft(storage, 'dataset:1:2', base, edited);
  assert.equal(clearCaptionDraft(storage, 'dataset:1:2'), true);
  assert.equal(readCaptionDraft(storage, 'dataset:1:2', base).recovered, false);
});

test('unavailable and corrupt storage never blocks editing or invents recovery', () => {
  assert.equal(writeCaptionDraft(null, 'dataset:1:2', base, edited), false);
  assert.equal(readCaptionDraft(null, 'dataset:1:2', base).unavailable, true);
  const storage = memoryStorage();
  storage.setItem('lds:caption-draft:dataset:1:2', '{broken');
  assert.equal(readCaptionDraft(storage, 'dataset:1:2', base).caption, base.caption);
  storage.setItem('lds:caption-draft:dataset:1:2', JSON.stringify({ version: 1, caption: 5 }));
  assert.equal(readCaptionDraft(storage, 'dataset:1:2', base).recovered, false);
});
