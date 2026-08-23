// Fork local-only: remote GPU rental UI (custom-base push gate, Rent & train
// button, remote-rental launch dialog) must stay deleted from TrainingPanel.
// Upstream merges that resurrect CloudLaunchDialog / CustomBasePushSection
// fail this contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// DIVERGENCE 4 — upstream now reads TrainingPanel.jsx + CloudLaunchDialog.jsx
// as one text, because its slice-1 extraction moved the dialog out of the panel.
// This fork does not carry that module (the rented-GPU launch dialog is the
// rental UI D4 removes), so the panel alone is still the whole feature here.
const panel = readFileSync(new URL('./TrainingPanel.jsx', import.meta.url), 'utf8');
// Split so this test file itself does not trip the local-only UI contract.
const trainInCloud = 'Train in ' + 'cloud';
test('TrainingPanel has no remote rental launch dialog or custom-base push gate', () => {
  assert.ok(!panel.includes('function CustomBasePushSection('));
  assert.ok(!panel.includes('function CloudLaunchDialog('));
  assert.ok(!panel.includes(trainInCloud));
  assert.ok(!panel.includes('Rent & train'));
  assert.ok(!panel.includes('train/cloud/custom-base'));
  assert.ok(!panel.includes('/train/cloud'));
});

test('TrainingPanel still trains locally via ai-toolkit', () => {
  assert.match(panel, /Train the LoRA/);
  assert.ok(panel.includes('ds.train(') || panel.includes('await ds.train'));
});
