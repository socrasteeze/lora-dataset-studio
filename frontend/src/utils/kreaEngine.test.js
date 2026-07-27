import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KREA_ASSET_LABELS, kreaMissingLabels, kreaUnavailableReason, groundingDescription,
  refOrientation, kreaFramingAdvisory, KREA_SUGGESTED_ASPECT, KREA_TIGHT_FRAMINGS,
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

// ── Reference shape vs body/back framing (MEASURED 2026-07-25) ──────────────
// Krea reproduces the reference's aspect ratio, so a square reference crops the
// wide shots. The two measured cases below are the anchors of this whole block:
// 1024x1024 came back a bust, 835x1024 came back a full figure.

const bodyShots = (n) => Array.from({ length: n }, () => 'body');

test('orientation buckets the two MEASURED references on the right side', () => {
  assert.equal(refOrientation(835, 1024), 'portrait', 'the one that produced a full figure');
  assert.equal(refOrientation(1024, 1024), 'square', 'the one that produced a bust');
  assert.equal(refOrientation(1920, 1080), 'landscape');
  // "Nearly square" behaves like square, so it is bucketed like square.
  assert.equal(refOrientation(1000, 1024), 'square');
  // Unmeasurable stays unmeasurable — never guessed into a bucket.
  for (const bad of [[0, 100], [100, 0], [null, 100], ['x', 'y'], [undefined, undefined]]) {
    assert.equal(refOrientation(bad[0], bad[1]), null, `bad size ${JSON.stringify(bad)}`);
  }
});

test('a square reference with body shots selected warns, and counts them', () => {
  const a = kreaFramingAdvisory({
    width: 1024, height: 1024,
    framings: [...bodyShots(17), 'back', 'face', 'bust'],
  });
  assert.ok(a, 'a square reference + wide shots is exactly the case to warn about');
  assert.equal(a.tight, 18, '17 body + 1 back');
  assert.equal(a.total, 20);
  assert.match(a.headline, /18 of your 20 selected shots/);
  assert.match(a.detail, /1024×1024/);
  assert.equal(a.suggestAspect, KREA_SUGGESTED_ASPECT);
  assert.equal(a.suggestLabel, '3:4');
});

test('the wording is honest: tighter, not impossible, and Krea-only', () => {
  const a = kreaFramingAdvisory({ width: 1024, height: 1024, framings: ['body'] });
  assert.match(a.detail, /still generate/i, 'a square reference DOES produce body shots');
  assert.doesNotMatch(a.detail, /impossible|cannot|won't work/i);
  assert.match(a.detail, /other engines follow each shot/i,
    'Klein and the API engines are untouched — the notice must not imply otherwise');
  // Singular/plural is not a cosmetic detail on a one-shot run.
  assert.match(a.headline, /1 of your 1 selected shot is a body or back framing/);
});

test('it stays quiet whenever it would be noise or a guess', () => {
  // Already portrait — nothing to fix.
  assert.equal(kreaFramingAdvisory({ width: 835, height: 1024, framings: bodyShots(17) }), null);
  // Wide reference but only close framings selected: the square is FINE for those.
  assert.equal(kreaFramingAdvisory({ width: 1024, height: 1024, framings: ['face', 'bust'] }), null);
  // Nothing selected yet.
  assert.equal(kreaFramingAdvisory({ width: 1024, height: 1024, framings: [] }), null);
  // Unmeasurable reference (exotic format, missing file, Pillow absent server-side):
  // an unknown shape is not a reason to alarm anyone.
  assert.equal(kreaFramingAdvisory({ width: null, height: null, framings: bodyShots(5) }), null);
  assert.equal(kreaFramingAdvisory({ framings: bodyShots(5) }), null);
  assert.equal(kreaFramingAdvisory(), null);
});

test('an exotic reference still gets a straight answer', () => {
  // Panoramic: the worst case, and the one most likely to surprise someone.
  const pano = kreaFramingAdvisory({ width: 3840, height: 1080, framings: ['body', 'back'] });
  assert.equal(pano.orientation, 'landscape');
  assert.equal(pano.tight, 2);
  // Tiny reference: the shape question is independent of the size question.
  const tiny = kreaFramingAdvisory({ width: 256, height: 256, framings: ['body'] });
  assert.equal(tiny.orientation, 'square');
  assert.match(tiny.sizeLabel, /^256×256$/);
});

test('only body and back are treated as needing vertical room', () => {
  assert.deepEqual(KREA_TIGHT_FRAMINGS, ['body', 'back']);
  for (const fr of ['face', 'bust', 'unknown', '']) {
    assert.equal(kreaFramingAdvisory({ width: 1024, height: 1024, framings: [fr] }), null, fr);
  }
});
