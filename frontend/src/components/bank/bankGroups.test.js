import assert from 'node:assert/strict'
import test from 'node:test'

import { groupKey, groupLabel, groupOverlapNote, groupRows } from './bankGroups.js'

const bank = (id, name, over = {}) => ({
  id, name, total: 10, scanned: 10, keep: 2, reject: 3, ...over,
})

/* ── THE TABLE OF CASES ───────────────────────────────────────────────────────
 * The rule is implemented twice — here and in bank_groups.py. Both sides are
 * pinned to THIS table (backend/tests/test_bank_groups.py carries the same
 * rows), so a change on one side that is not made on the other fails a test
 * rather than producing two silently different groupings.
 * ────────────────────────────────────────────────────────────────────────── */
const CASES = [
  { why: 'exact same name groups', names: ['Telegram', 'Telegram'], grouped: true },
  { why: 'surrounding whitespace is ignored', names: ['Telegram', ' Telegram '], grouped: true },
  { why: 'CASE is significant — never merge silently', names: ['Telegram', 'telegram'], grouped: false },
  { why: 'different names never group', names: ['A', 'B'], grouped: false },
  { why: 'an empty name never groups', names: ['', ''], grouped: false },
  { why: 'whitespace-only is an empty name', names: ['   ', '   '], grouped: false },
]

for (const c of CASES) {
  test(`grouping rule: ${c.why}`, () => {
    const rows = groupRows(c.names.map((n, i) => bank(i + 1, n)))
    const groups = rows.filter((r) => r.kind === 'group')
    assert.equal(groups.length, c.grouped ? 1 : 0, c.why)
  })
}

test('a bank marked keep_separate is never a member', () => {
  const rows = groupRows([
    bank(1, 'Telegram'), bank(2, 'Telegram', { keep_separate: true }),
  ])
  assert.equal(rows.filter((r) => r.kind === 'group').length, 0,
    'one opted-out member leaves a single bank, and a group needs two')
  assert.equal(groupKey(bank(9, 'Telegram', { keep_separate: true })), null)
})

test('keep_separate leaves the OTHERS grouped', () => {
  const rows = groupRows([
    bank(1, 'T'), bank(2, 'T'), bank(3, 'T', { keep_separate: true }),
  ])
  const group = rows.find((r) => r.kind === 'group')
  assert.deepEqual(group.members.map((m) => m.id), [1, 2])
  assert.ok(rows.some((r) => r.kind === 'bank' && r.bank.id === 3))
})

test('a group needs TWO — one bank with a name is just a bank', () => {
  const rows = groupRows([bank(1, 'Solo')])
  assert.deepEqual(rows.map((r) => r.kind), ['bank'])
})

test('the lead is the smallest member id, whatever the list order', () => {
  const rows = groupRows([bank(7, 'T'), bank(3, 'T'), bank(9, 'T')])
  const group = rows.find((r) => r.kind === 'group')
  assert.equal(group.leadId, 3)
  assert.deepEqual(group.members.map((m) => m.id), [3, 7, 9])
})

test('a group takes the position of its FIRST member', () => {
  // A re-sort then MOVES the card instead of reshuffling everything around it.
  const rows = groupRows([bank(1, 'A'), bank(2, 'T'), bank(3, 'B'), bank(4, 'T')])
  assert.deepEqual(rows.map((r) => r.kind), ['bank', 'group', 'bank'])
  assert.equal(rows[1].name, 'T')
})

test('counters are summed from the rows already on screen', () => {
  const rows = groupRows([
    bank(1, 'T', { total: 10, keep: 2, reject: 3, scanned: 8 }),
    bank(2, 'T', { total: 5, keep: 1, reject: 0, scanned: 5 }),
  ])
  const g = rows.find((r) => r.kind === 'group')
  assert.equal(g.total, 15)
  assert.equal(g.keep, 3)
  assert.equal(g.reject, 3)
  assert.equal(g.scanned, 13)
  assert.equal(g.untriaged, (10 - 2 - 3) + (5 - 1 - 0))
})

test('overlapping members are SAID to double-count, not quietly wrong', () => {
  const clean = groupRows([bank(1, 'T'), bank(2, 'T')])[0]
  assert.equal(groupOverlapNote(clean), null)
  const overlapping = groupRows([
    bank(1, 'T', { overlapping_banks: [{ id: 2, name: 'T' }] }), bank(2, 'T'),
  ])[0]
  assert.match(groupOverlapNote(overlapping), /more than once/)
  assert.match(groupOverlapNote(overlapping), /Promoting is still safe/)
  assert.equal(groupOverlapNote({ kind: 'bank' }), null)
})

test('the label counts the OTHERS, not the group', () => {
  assert.equal(groupLabel(1), 'grouped with 1 other bank')
  assert.equal(groupLabel(2), 'grouped with 2 other banks')
  assert.equal(groupLabel(0), 'grouped with 0 other banks')
})

test('an empty or missing list is not a crash', () => {
  assert.deepEqual(groupRows([]), [])
  assert.deepEqual(groupRows(null), [])
  assert.equal(groupKey(null), null)
})
