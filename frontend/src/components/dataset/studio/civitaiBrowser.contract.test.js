import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const button = read('./CivitaiBrowserButton.jsx');
const promptField = read('./PromptField.jsx');
const comparisonSetup = read('./StudioRunSetup.jsx');

test('offline prompt surfaces keep one inactive compatibility component', () => {
  assert.match(promptField, /<CivitaiBrowserButton /);
  assert.match(comparisonSetup, /<CivitaiBrowserButton /);
  assert.match(button, /return null/);
  assert.doesNotMatch(button, /CivitaiBrowserModal|apiFetch|fetch\(|useEffect/);
});

test('📝 the multi-LoRA comparison owns the batch too — it used to own none', () => {
  /* `create_comparison_run` has always accepted `prompts`, but POST
     /api/studio/run never forwarded it, so NO source could build a batch on the
     comparison — not Civitai, not the saved prompts, not the 🎬 scenes — and
     nothing was red about it. These pins hold the three halves together: the
     screen that owns the state and posts it, the panel that shows it and
     multiplies the cost by it, and the route that carries it. */
  const owner = readFileSync(new URL('./ComparisonStudio.jsx', import.meta.url), 'utf8');
  assert.match(owner, /mergeBatches\(historyBatch, civitaiPicks\)/);
  assert.match(owner, /body\.prompts = \[\.\.\.pickedPrompts\]/);
  assert.match(comparisonSetup, /promptCount: Math\.max\(1, picked\.length\)/);
  assert.match(comparisonSetup, /batch=\{batchPrompts\} onToggleBatch=\{onToggleBatchPrompt\}/);
});
