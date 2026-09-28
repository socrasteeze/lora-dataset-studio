import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImportFiles } from './importFilePolicy.js';

test('a HEIC file is refused before upload with conversion guidance', async () => {
  const file = new File(['\x00\x00\x00\x18ftypheic'], 'photo.HEIC', { type: 'image/heic' });
  const result = await inspectImportFiles([file]);
  assert.equal(result.accepted.length, 0);
  assert.match(result.refused[0].reason, /export as JPEG or PNG/);
});

test('renaming HEIF to JPEG does not bypass format inspection', async () => {
  const file = new File(['\x00\x00\x00\x18ftypmif1'], 'photo.jpg', { type: 'image/jpeg' });
  assert.match((await inspectImportFiles([file])).refused[0].reason, /HEIC\/HEIF/);
});

test('a phone-converted JPEG is accepted even when its old HEIC label remains', async () => {
  const file = new File([new Uint8Array([255, 216, 255, 224])], 'photo.HEIC', { type: 'image/heic' });
  assert.deepEqual((await inspectImportFiles([file])).accepted, [file]);
});

test('supported files continue in order while unsupported files are named', async () => {
  const jpeg = new File([new Uint8Array([255, 216, 255, 224])], 'one.jpg', { type: 'image/jpeg' });
  const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10])], 'two.png');
  const unknown = new File(['unreadable'], 'three.bin');
  const result = await inspectImportFiles([jpeg, unknown, png]);
  assert.deepEqual(result.accepted, [jpeg, png]);
  assert.equal(result.refused[0].name, 'three.bin');
});

test('a file read failure is reported to the caller rather than uploaded', async () => {
  await assert.rejects(inspectImportFiles([{ slice: () => { throw Error('file unavailable'); } }]), /file unavailable/);
});
