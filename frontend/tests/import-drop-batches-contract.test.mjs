/** A drop is split into the requests the server takes — and every dropzone
 * hands the hook the server's figures to do it with.
 *
 * Source contract, like the others in this folder: node --test parses no JSX,
 * so it reads the files as text. What it pins is the wiring the reported 413
 * depended on (_nofaceman, Discord, 2026-09-07): the hook plans batches, the
 * dropzone passes the capability policy, and both workspace call sites pass it
 * through — the concept one used to drop the options on the floor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const hook = read('../src/hooks/useDataset.js');
const dropzone = read('../src/components/dataset/ImportDropzone.jsx');
const workspace = read('../src/components/dataset/DatasetWorkspace.jsx');

const queue = read('../src/hooks/useImportQueue.js');
test('imports persist originals and honor server limits before sequential uploads', () => {
  assert.match(hook, /useImportQueue\(currentId/);
  assert.match(queue, /planImportBatches\(inspected.accepted, policy\)/);
  assert.match(queue, /stageImportQueue\(datasetId, instanceId, selected, crop\)/);
  assert.match(queue, /await postForm\(`/);
  assert.match(queue, /form.append\('import_key', item.key\)/);
  assert.match(queue, /await completeImportFile/);
  assert.match(queue, /oversizedFilesMessage\(oversized, limits\)/);
});

test('the dropzone forwards policy and describes per-file recovery', () => {
  assert.match(dropzone, /onImport\(files, \{ crop: [^}]*, policy: importPolicy \}\)/);
  assert.match(dropzone, /Photos upload one at a time with recovery after each file/);
});
test('all dataset kinds share one dropzone that forwards the policy', () => {
  const sites = workspace.match(/<ImportDropzone[^>]*onImport=\{\(f, o\) => ds\.importFiles\(f, [^)]*\)\}/g) || [];
  assert.equal(sites.length, 1, 'all kinds use the same import path');
  assert.ok(sites.every((s) => /policy/.test(s) || /ds\.importFiles\(f, o\)/.test(s)));
  assert.match(workspace, /cropOption=\{!isConceptual\}/);
});
