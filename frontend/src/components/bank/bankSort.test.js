import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK_SORTS, DEFAULT_BANK_SORT, bankMatches, normalizeBankSort, sortBanks, untriagedCount,
} from './bankSort.js';

const bank = (id, name, created_at, extra = {}) => ({
  id, name, created_at, total: 0, keep: 0, reject: 0, ...extra,
});

const LIBRARY = [
  bank(1, 'Telegram export 2', '2026-01-02T00:00:00', { total: 40, keep: 10, reject: 10 }),
  bank(2, 'archive', '2026-03-01T00:00:00', { total: 900, keep: 0, reject: 0 }),
  bank(3, 'Telegram export 10', '2026-02-01T00:00:00', { total: 120, keep: 120, reject: 0 }),
];

const names = (rows) => rows.map((b) => b.name);

test('sortBanks: newest first is the default order', () => {
  assert.deepEqual(names(sortBanks(LIBRARY, DEFAULT_BANK_SORT)),
    ['archive', 'Telegram export 10', 'Telegram export 2']);
  assert.deepEqual(names(sortBanks(LIBRARY, 'oldest')),
    ['Telegram export 2', 'Telegram export 10', 'archive']);
});

test('sortBanks: by name is case-insensitive and numeric-aware ("2" before "10")', () => {
  assert.deepEqual(names(sortBanks(LIBRARY, 'name')),
    ['archive', 'Telegram export 2', 'Telegram export 10']);
  assert.deepEqual(names(sortBanks(LIBRARY, 'name_desc')),
    ['Telegram export 10', 'Telegram export 2', 'archive']);
});

test('sortBanks: by size and by what is left to triage', () => {
  assert.deepEqual(names(sortBanks(LIBRARY, 'images')),
    ['archive', 'Telegram export 10', 'Telegram export 2']);
  // archive: 900 untouched · Telegram 2: 20 left · Telegram 10: fully triaged
  assert.deepEqual(names(sortBanks(LIBRARY, 'untriaged')),
    ['archive', 'Telegram export 2', 'Telegram export 10']);
  assert.equal(untriagedCount(LIBRARY[0]), 20);
  assert.equal(untriagedCount(LIBRARY[2]), 0);
});

test('sortBanks: never mutates the array React holds', () => {
  const rows = LIBRARY.slice();
  const before = names(rows);
  sortBanks(rows, 'name');
  assert.deepEqual(names(rows), before);
});

test('sortBanks: junk input degrades to the default order, never to a crash', () => {
  assert.deepEqual(sortBanks(null, 'name'), []);
  assert.deepEqual(sortBanks(undefined, undefined), []);
  assert.deepEqual(names(sortBanks(LIBRARY, 'nonsense-from-an-old-build')),
    names(sortBanks(LIBRARY, DEFAULT_BANK_SORT)));
  assert.equal(normalizeBankSort('nope'), DEFAULT_BANK_SORT);
});

test('sortBanks: the order is total — ties fall back to name then id', () => {
  const tied = [bank(9, 'same', '2026-01-01T00:00:00', { total: 5 }),
    bank(4, 'same', '2026-01-01T00:00:00', { total: 5 })];
  assert.deepEqual(sortBanks(tied, 'images').map((b) => b.id), [4, 9]);
  assert.deepEqual(sortBanks(tied.slice().reverse(), 'images').map((b) => b.id), [4, 9]);
});

test('every advertised sort id has a working comparator', () => {
  for (const s of BANK_SORTS) {
    assert.equal(normalizeBankSort(s.id), s.id, s.id);
    assert.equal(sortBanks(LIBRARY, s.id).length, LIBRARY.length, s.id);
    assert.ok(s.label, s.id);
  }
});

// ── search ────────────────────────────────────────────────────────────────
// A library past a couple of dozen banks needs finding, not just ordering.

test('bankMatches: empty query matches everything', () => {
  assert.equal(bankMatches({ name: 'Anything' }, ''), true)
  assert.equal(bankMatches({ name: 'Anything' }, '   '), true)
  assert.equal(bankMatches({ name: 'Anything' }), true)
})

test('bankMatches: name and folder, case-insensitively', () => {
  const b = { name: 'Studio Shoot', source_path: String.raw`D:\photos\2026\paris` }
  assert.equal(bankMatches(b, 'studio'), true)
  assert.equal(bankMatches(b, 'SHOOT'), true)
  // The folder is searchable too: banks are often named alike and live apart.
  assert.equal(bankMatches(b, 'paris'), true)
  assert.equal(bankMatches(b, '2026'), true)
  assert.equal(bankMatches(b, 'berlin'), false)
})

test('bankMatches: the query is trimmed, not tokenised', () => {
  const b = { name: 'Studio Shoot' }
  assert.equal(bankMatches(b, '  studio  '), true)
  // Substring, not fuzzy: a filter that matches what you did NOT type is worse
  // than one that misses.
  assert.equal(bankMatches(b, 'studio shoot'), true)
  assert.equal(bankMatches(b, 'shoot studio'), false)
})

test('bankMatches: a junk or half-loaded row never throws', () => {
  assert.equal(bankMatches(null, 'x'), false)
  assert.equal(bankMatches({}, 'x'), false)
  assert.equal(bankMatches({ name: null, source_path: null }, 'x'), false)
})
