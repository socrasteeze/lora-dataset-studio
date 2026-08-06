import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REASON_IDS, reasonBuckets, reasonHint, reasonLabel,
} from './bankRejectReasons.js';
import { shownBuckets } from './bankMedium.js';

// The real table, as BankWorkspace passes it in.
const FLAG_LABEL = {
  blur: 'Blurry', noise: 'Noisy', uniform: '⬜ Flat',
  small: '📐 Small', unreadable: '❌ Unreadable',
  soft_detail: '🔬 Soft detail', bars: '⬛ Bars',
  low_aesthetic: 'Low aesthetic', nsfw: '🔞 NSFW', watermark: 'Watermark',
};

test('every reason the backend can write has a label', () => {
  // The contract's frontend half — the backend half is
  // test_bank_reject_reason_facet.test_every_reason_the_backend_can_write_has_a_chip.
  // A reason with no bucket here is a pile with no chip, which is exactly how
  // auto-rejected duplicates became unreachable in the first place.
  const buckets = reasonBuckets(FLAG_LABEL);
  assert.equal(buckets.length, REASON_IDS.length);
  for (const b of buckets) {
    assert.ok(b.label && b.label.trim(), `${b.id}: empty label`);
    assert.notEqual(b.label, b.id, `${b.id}: fell back to the raw id`);
  }
});

test('flag-derived reasons reuse FLAG_LABEL instead of a second copy', () => {
  // A chip relabelled in one place is relabelled everywhere that reads it.
  assert.equal(reasonLabel('blur', FLAG_LABEL), 'Blurry');
  assert.equal(reasonLabel('nsfw', FLAG_LABEL), '🔞 NSFW');
  assert.equal(reasonLabel('blur', { ...FLAG_LABEL, blur: 'Out of focus' }),
    'Out of focus');
});

test('the four reasons this row owns are not taken from FLAG_LABEL', () => {
  // No flag produces these: two dedup stages, a human, and the NULL bucket.
  assert.equal(reasonLabel('duplicate', FLAG_LABEL), '≈ Duplicate');
  assert.equal(reasonLabel('semantic_dup', FLAG_LABEL), '✂ Same shot');
  assert.equal(reasonLabel('manual', FLAG_LABEL), '✋ By hand');
  assert.equal(reasonLabel('unrecorded', FLAG_LABEL), '❔ Not recorded');
  // …and they win over a flag table that happens to carry the same key, so a
  // future flag named 'manual' cannot silently rename a human decision.
  assert.equal(reasonLabel('manual', { manual: 'Manual flag' }), '✋ By hand');
});

test('an unknown reason falls back to its raw id, never to silence', () => {
  // Stored ids travel in bookmarks and localStorage, and the server can write a
  // reason a stale bundle has never heard of. An unlabelled pile is bad; an
  // unnamed one the user cannot even see is worse.
  assert.equal(reasonLabel('some_future_flag', FLAG_LABEL), 'some_future_flag');
  assert.equal(reasonLabel('blur', undefined), 'blur');
});

test('duplicates and same-shot explain why their own chip reads 0', () => {
  // The hint is doing the load-bearing work of the whole feature: it has to say
  // that the ≈ chip dropping to 0 is CORRECT, or the next person reads it as
  // the bug being back.
  assert.match(reasonHint('duplicate'), /0/);
  assert.match(reasonHint('semantic_dup'), /resolved/);
  assert.match(reasonHint('unrecorded'), /Nothing is wrong with these images/);
});

test('a flag-derived reason keeps the caveat already written for its flag', () => {
  // 🔬 Soft detail and ⬛ Bars carry "check before mass-rejecting" warnings in
  // FLAG_HINT. Restating them here is how two copies drift into contradicting
  // each other, so the flag's own hint is reused.
  const FLAG_HINT = { bars: 'Flat black letterbox bars — check before mass-rejecting.' };
  assert.equal(reasonHint('bars', FLAG_HINT), FLAG_HINT.bars);
  assert.equal(reasonHint('blur', FLAG_HINT), null);
});

test('a reason chip holding nothing is hidden, unless it is the active one', () => {
  // Same rule as the framing/medium rows: a chip must never vanish under the
  // cursor mid-review, or clicking it would clear itself.
  const buckets = reasonBuckets(FLAG_LABEL);
  const counts = { duplicate: 6887, blur: 412 };
  assert.deepEqual(shownBuckets(buckets, counts, null).map((b) => b.id),
    ['duplicate', 'blur']);
  assert.deepEqual(shownBuckets(buckets, counts, 'nsfw').map((b) => b.id),
    ['duplicate', 'blur', 'nsfw']);
});

test('the ids are stored values and stay in their documented order', () => {
  // Ids are query-string values AND rows already sitting in user databases —
  // never renamed without an alias. Order mirrors backend REASON_KEYS so the
  // chip row reads the same way the counts arrive.
  assert.deepEqual(REASON_IDS.slice(0, 3), ['duplicate', 'semantic_dup', 'manual']);
  assert.equal(REASON_IDS[REASON_IDS.length - 1], 'unrecorded');
  assert.equal(new Set(REASON_IDS).size, REASON_IDS.length, 'duplicate id');
});
