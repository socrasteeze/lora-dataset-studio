import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KREA_ASSET_LABELS, kreaMissingLabels, kreaUnavailableReason, groundingDescription,
} from './kreaEngine.js';
import {
  ENGINES, LOCAL_ENGINES, API_ENGINES, ENGINE_LABELS, ENGINE_RATES, ENGINE_ACCENTS,
  canonicalEngines, engineBatches, localOnly, localQueuesBehindApi, estimateCost,
  billingEngines, totalImages, readEngines, writeEngines,
} from '../components/dataset/engineSelection.js';

// ── The engine is a first-class member of the selection model ────────────────

test('krea is a real engine everywhere the selection model looks', () => {
  assert.ok(ENGINES.includes('krea'));
  assert.ok(LOCAL_ENGINES.includes('krea'));
  assert.ok(!API_ENGINES.includes('krea'), 'krea is local, never an API engine');
  assert.equal(ENGINE_LABELS.krea, 'Krea 2 Edit');
  assert.equal(ENGINE_RATES.krea, 0, 'local GPU time is free');
  assert.ok(ENGINE_ACCENTS.krea, 'a card with no accent renders unstyled');
  assert.deepEqual(canonicalEngines(['krea', 'nope', 'klein']), ['klein', 'krea']);
});

// ── Divergence 1: the catalogue is LOCAL-ONLY, and stays that way ────────────

test('the engine catalogue holds no cloud engine at all', () => {
  assert.deepEqual(API_ENGINES, [], 'this fork has no API engines — see Divergence 1');
  assert.deepEqual(ENGINES, LOCAL_ENGINES, 'every engine offered runs on the local GPU');
  for (const cloud of ['nanobanana', 'chatgpt', 'openrouter']) {
    assert.ok(!ENGINES.includes(cloud), `${cloud} must never be selectable`);
    assert.equal(ENGINE_LABELS[cloud], undefined, `${cloud} must have no label`);
  }
});

test('a stored cloud engine is dropped rather than honoured', () => {
  // A config written before the engines were removed, or by upstream's build.
  assert.deepEqual(canonicalEngines(['nanobanana', 'krea', 'openrouter']), ['krea']);
  assert.deepEqual(canonicalEngines(['chatgpt']), [],
    'nothing local left in the selection = an empty selection, not a cloud run');
});

test('a Krea run is free and bills nobody', () => {
  assert.equal(estimateCost(30, ['krea'], 'split', { multiplier: 2 }), 0);
  assert.deepEqual(billingEngines(['krea', 'klein']), []);
  // Every rate in the table is 0, so nothing can ever bill — not even a
  // selection that still names a removed cloud engine.
  assert.deepEqual(billingEngines(['krea', 'nanobanana']), []);
  assert.equal(totalImages(10, ['krea', 'klein'], 'all', 1), 20);
});

// ── Dispatch order: with only GPU engines the canonical order is kept ────────

test('local batches dispatch in canonical order', () => {
  const shots = [1, 2, 3, 4, 5, 6];
  const order = engineBatches(shots, ['krea', 'klein'], 'split').map((b) => b.generator);
  assert.deepEqual(order, ['klein', 'krea'],
    'both engines hold the same GPU, so the sort is a no-op over canonical order');
});

test('localQueuesBehindApi is false for every selection this fork can make', () => {
  assert.equal(localQueuesBehindApi(['krea', 'klein']), false);
  assert.equal(localQueuesBehindApi(['krea']), false);
  // Even a leftover cloud id cannot raise the warning: it is dropped first.
  assert.equal(localQueuesBehindApi(['krea', 'chatgpt']), false);
});

// ── NSFW gating widened from "Klein alone" to "every engine is local" ────────

test('localOnly unlocks the uncensored catalog for any all-local run', () => {
  assert.equal(localOnly(['krea']), true);
  assert.equal(localOnly(['klein', 'krea']), true, 'two local engines together are fine');
  assert.equal(localOnly(['krea', 'openrouter']), true,
    'the cloud id is dropped, leaving an all-local run — there is no API lane to lock');
  assert.equal(localOnly([]), false, 'nothing selected renders nothing');
  assert.equal(localOnly(['chatgpt']), false, 'a cloud-only selection is an empty one');
});

// ── Storage compatibility: the legacy single-string key still rules ──────────

test('a profile that only ever knew the legacy key can still name krea', () => {
  const map = new Map([['datasetGenerator', 'krea']]);
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
  assert.deepEqual(readEngines(storage), ['krea']);
  writeEngines(storage, ['krea', 'chatgpt']);
  assert.equal(map.get('datasetGenerator'), 'krea', 'legacy mirror follows the primary');
});

test('a profile still holding a removed cloud engine falls back to Klein', () => {
  const map = new Map([['datasetGenerator', 'nanobanana']]);
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
  assert.deepEqual(readEngines(storage), ['klein'],
    'the removed engine is unusable, so the default local engine answers instead');
});

// ── The "why can't I pick it?" sentence — one branch per real failure ────────

test('every missing asset key has a word, in a stable order', () => {
  assert.deepEqual(
    kreaMissingLabels(['krea_vae', 'krea_identity_lora', 'krea_model']),
    ['base model', 'identity edit LoRA', 'VAE']);
  assert.deepEqual(kreaMissingLabels([]), []);
  assert.deepEqual(kreaMissingLabels(undefined), []);
  assert.deepEqual(kreaMissingLabels(['who_knows']), [], 'unknown keys are dropped');
  // Every key the backend can send must have a word, or the sentence loses it.
  for (const key of ['krea_model', 'krea_identity_lora', 'krea_text_encoder', 'krea_vae']) {
    assert.ok(KREA_ASSET_LABELS[key], `no label for ${key}`);
  }
});

test('the unavailable reason names the FIRST thing to fix, never just "off"', () => {
  assert.equal(kreaUnavailableReason({}), null, 'nothing missing = pickable');

  assert.match(kreaUnavailableReason({ enabledInSettings: false }), /disabled in Settings/);

  assert.match(
    kreaUnavailableReason({ comfyuiReachable: false, missingAssets: ['krea_model'] }),
    /Configure ComfyUI/,
    'an unreachable ComfyUI makes the asset list meaningless — say that instead');

  assert.match(
    kreaUnavailableReason({
      missingNodes: ['Krea2EditModelPatch'], missingAssets: ['krea_model'],
    }),
    /comfyui-krea2edit node pack/,
    'the node pack comes first: without it nothing runs even with every file present');

  const assetsOnly = kreaUnavailableReason({
    missingAssets: ['krea_identity_lora', 'krea_vae'], missingNodes: [],
  });
  assert.match(assetsOnly, /identity edit LoRA \+ VAE/);
  assert.doesNotMatch(assetsOnly, /node pack/);
});

// ── The dial has to MEAN something, not just show a number ───────────────────

test('grounding is described in words at every end of the range', () => {
  assert.match(groundingDescription(512), /follows the prompt/);
  assert.match(groundingDescription(768), /leans towards the prompt/);
  assert.match(groundingDescription(1024), /balanced/);
  assert.match(groundingDescription(1536), /sticks to the reference/);
  assert.match(groundingDescription(undefined), /default/);
  assert.match(groundingDescription('nonsense'), /default/);
});
