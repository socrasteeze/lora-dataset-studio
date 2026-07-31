import assert from 'node:assert/strict';
import test from 'node:test';

import { dupBadges, dupStateSuffix } from './bankDupBadge.js';

// The bug: a tile drew ≈ whenever `dup_group` was set, which only ever meant
// "was once grouped". Nothing clears that column, so on a fully resolved bank
// 10 060 images wore a duplicate mark while the ≈ chip beside them read 0.

test('a resolved group draws nothing on the tile', () => {
  const img = { dup_group: 7, dup_unresolved: false };
  assert.deepEqual(dupBadges(img), []);
});

test('an open group still draws its mark', () => {
  const [b, ...rest] = dupBadges({ dup_group: 7, dup_unresolved: true });
  assert.equal(rest.length, 0);
  assert.equal(b.text, '≈7');
  assert.match(b.cls, /fuchsia/);
  assert.match(b.title, /still to resolve/);
});

test('a MISSING flag counts as resolved, never as open', () => {
  // An older cached payload, or a call site that forgets to wire the live
  // state, must go quiet — not silently restore the bug.
  assert.deepEqual(dupBadges({ dup_group: 7 }), []);
  assert.deepEqual(dupBadges({ dup_group: 7, dup_unresolved: undefined }), []);
  // Truthiness is not enough either: only an explicit true opens it.
  assert.deepEqual(dupBadges({ dup_group: 7, dup_unresolved: 'yes' }), []);
});

test('an ungrouped image draws nothing, whatever the flag says', () => {
  assert.deepEqual(dupBadges({ dup_group: null, dup_unresolved: true }), []);
  assert.deepEqual(dupBadges({}), []);
  assert.deepEqual(dupBadges(null), []);
});

test('the two stages are independent', () => {
  // Exact resolved, semantic still open -> only ✂.
  const out = dupBadges({
    dup_group: 3, dup_unresolved: false,
    semantic_dup_group: 9, semantic_dup_unresolved: true,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].text, '✂9');
  assert.match(out[0].cls, /orange/);
  assert.match(out[0].title, /same shot/);
});

test('group 0 is not mistaken for "no group"', () => {
  // Ids are 1-based today (rebuild_dup_groups starts at 1), so this is a guard
  // against a future change, not a live case — but `if (gid)` would break it.
  assert.equal(dupBadges({ dup_group: 0, dup_unresolved: true })[0].text, '≈0');
});

test('dupStateSuffix says "resolved" only when the group is closed', () => {
  assert.equal(dupStateSuffix({ dup_group: 7, dup_unresolved: true }, 'dup'), '');
  assert.equal(dupStateSuffix({ dup_group: 7, dup_unresolved: false }, 'dup'),
    ' · resolved');
  // Nothing to qualify when there is no group at all.
  assert.equal(dupStateSuffix({ dup_group: null }, 'dup'), '');
  assert.equal(dupStateSuffix({ semantic_dup_group: 2 }, 'sdup'), ' · resolved');
});
