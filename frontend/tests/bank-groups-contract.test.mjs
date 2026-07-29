/* Banks grouped by name — the wiring, and the one rule that lives on both sides.
 *
 * The rule itself (key = trimmed exact name, keep_separate opts out, 2+ members,
 * lead = min id) is unit-tested twice on purpose: bankGroups.test.js and
 * backend/tests/test_bank_groups.py carry the same table of cases. Publishing
 * the group on the row instead would break the list's in-place rename patch,
 * which exists because GET /api/banks force-re-walks every source folder.
 *
 * What THIS file pins is what those tests cannot see: that the group card is
 * wired at all, that the queue and promote go through the SERVER's member list,
 * and that there is no one-click way to delete five banks.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const page = read('../src/pages/BankPage.jsx')
const card = read('../src/components/bank/BankGroupCard.jsx')
const promote = read('../src/components/bank/BankGroupPromoteDialog.jsx')
const logic = read('../src/components/bank/bankGroups.js')
const rule = read('../../backend/app/services/bank_groups.py')

test('the two implementations of the rule agree on the four decisions', () => {
  // Not a diff of the code (two languages) — a check that each side still SAYS
  // the same four things, so a change to one is visible next to the other.
  for (const src of [logic, rule]) {
    assert.match(src, /keep_separate/, 'the opt-out exists on both sides')
    assert.match(src, /2\+ members|len\(v\) >= 2|< 2/, 'a group needs two')
    assert.match(src, /case-sensitive/i, 'case is significant, deliberately')
  }
  assert.match(logic, /String\(bank\.name \?\? ''\)\.trim\(\)/)
  assert.match(rule, /str\(name or ''\)\.strip\(\)/)
})

test('the list renders group rows instead of a flat bank list', () => {
  assert.match(page, /groupRows\(sortBanks\(banks, sort\)\)/)
  assert.match(page, /row\.kind === 'group'/)
  assert.match(page, /<BankGroupCard/)
})

test('the group queue and promote go through the SERVER member list', () => {
  // A stale card — a rename in another tab, a bank deleted a second ago — must
  // not be able to queue banks that no longer share a name, or promote into the
  // wrong dataset. Neither call sends a member list.
  assert.match(page, /postJson\(`\/api\/bank-group\/\$\{lead\}\/queue`, config\)/)
  assert.match(promote, /postJson\(`\/api\/bank-group\/\$\{row\.leadId\}\/promote`/)
  assert.doesNotMatch(page, /bank_ids:/)
  assert.doesNotMatch(promote, /bank_ids:/)
})

test('there is no group-level delete — one click must not remove five banks', () => {
  // Delete is per-member, inside the disclosure, one extra click for something
  // irreversible.
  assert.doesNotMatch(card, /Remove the group|Delete the group/)
  assert.match(card, /aria-label=\{`Remove bank \$\{m\.name\}`\}/)
})

test('every member keeps its own rename, relocate, delete and keep-separate', () => {
  assert.match(card, /onRename\?\.\(m\)/)
  assert.match(card, /onRelocate\?\.\(m\)/)
  assert.match(card, /onRemove\?\.\(m\)/)
  assert.match(card, /onKeepSeparate\?\.\(m, e\.target\.checked\)/)
  assert.match(card, /Keep separate/)
})

test('keep-separate is patched in place, not re-fetched', () => {
  // GET /api/banks force-re-walks every source folder; firing it for one
  // checkbox is what the in-place patch exists to avoid.
  assert.match(page, /postJson\(`\/api\/bank\/\$\{bank\.id\}\/keep-separate`/)
  assert.match(page, /setBanks\(\(rows\) => \(rows \|\| \[\]\)\.map\(\s*\n?\s*\(b\) => \(b\.id === bank\.id \? \{ \.\.\.b, keep_separate: d\.keep_separate \}/)
})

test('overlapping members are told they double-count', () => {
  // Promotion is safe (the import dedupes) but the summed counters are not, and
  // a number that is quietly wrong is worse than one that is explained.
  assert.match(card, /groupOverlapNote\(row\)/)
  assert.match(card, /\{overlap && /)
})

test('the group promote states there is no selection and no double import', () => {
  assert.match(promote, /Every kept image across the \{row\.members\.length\} banks/)
  assert.match(promote, /imported once/)
  // A refusal keeps the dialog open with the choice intact — the usual one is
  // "a pass is running on one of these banks", which is fixed and retried.
  assert.match(promote, /setError\(e\?\.message/)
})
