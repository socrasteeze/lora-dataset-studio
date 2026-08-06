import test from 'node:test'
import assert from 'node:assert/strict'
import { bankFilterCount, bankFilterParts, bankFilterSummary } from './bankFilterSummary.js'

const LABELS = {
  FLAG_LABEL: { blur: 'Blurry', low_aesthetic: 'Low aesthetic' },
  RES_BUCKETS: [{ id: 'res_1_2', label: '1–2 MP' }, { id: 'res_2_4', label: '2–4 MP' }],
  FRAMING_BUCKETS: [{ id: 'face', label: '😀 Face' }],
  ORIGIN_BUCKETS: [{ id: 'ai', label: '🤖 AI' }],
  REASON_BUCKETS: [{ id: 'duplicate', label: '≈ Duplicate' },
    { id: 'unrecorded', label: '❔ Not recorded' }],
}

test('an empty filter has nothing to say', () => {
  assert.deepEqual(bankFilterParts({}, { labels: LABELS }), [])
  assert.equal(bankFilterCount({}, { labels: LABELS }), 0)
  const s = bankFilterSummary({}, { labels: LABELS })
  assert.equal(s.count, 0)
  assert.equal(s.text, 'All images')
})

test('a sort alone is not a filter', () => {
  assert.equal(bankFilterCount({ sort: 'aesthetic_desc' }, { labels: LABELS }), 0)
})

test('status, flag, cluster, style read as words', () => {
  assert.deepEqual(bankFilterParts({ status: 'pending' }, { labels: LABELS }), ['Undecided'])
  assert.deepEqual(bankFilterParts({ status: 'keep' }, { labels: LABELS }), ['✓ Kept'])
  assert.deepEqual(bankFilterParts({ status: 'reject' }, { labels: LABELS }), ['✕ Rejected'])
  assert.deepEqual(bankFilterParts({ flag: 'blur' }, { labels: LABELS }), ['Blurry'])
  assert.deepEqual(bankFilterParts({ cluster: 3 }, { labels: LABELS }), ['👥 Person #3'])
  assert.deepEqual(bankFilterParts({ style: 2 }, { labels: LABELS }), ['🎨 Style #2'])
})

test('grouping flags (dups/clean/etc) resolve without a passed-in label', () => {
  assert.deepEqual(bankFilterParts({ flag: 'dups' }, { labels: LABELS }), ['≈ Duplicates'])
  assert.deepEqual(bankFilterParts({ flag: 'semantic_dups' }, { labels: LABELS }), ['✂ Same shot'])
  assert.deepEqual(bankFilterParts({ flag: 'clean' }, { labels: LABELS }), ['✨ Clean'])
  assert.deepEqual(bankFilterParts({ flag: 'no_face' }, { labels: LABELS }), ['🚫👤 No face'])
})

test('an unknown flag id is still named, never silently dropped', () => {
  assert.deepEqual(bankFilterParts({ flag: 'invented' }, { labels: LABELS }), ['invented'])
})

test('resolution, origin and framing buckets read their label table', () => {
  assert.deepEqual(bankFilterParts({ resBucket: 'res_1_2' }, { labels: LABELS }), ['1–2 MP'])
  assert.deepEqual(bankFilterParts({ origin: 'ai' }, { labels: LABELS }), ['Origin: 🤖 AI'])
  assert.deepEqual(bankFilterParts({ framing: 'face' }, { labels: LABELS }), ['😀 Face'])
})

test('an unmapped bucket id falls back to its raw id, not silence', () => {
  assert.deepEqual(bankFilterParts({ resBucket: 'res_gt_16' }, { labels: LABELS }), ['res_gt_16'])
})

test('✕ Why is named, and counts, even with no status chip lit', () => {
  // The reason facet scopes itself to rejected rows server-side, so it can
  // narrow the grid on its own. Unnamed here, a folded panel would show
  // "6 887 shown" with nothing explaining why the other 40 000 are gone —
  // which reads as data loss, the failure this module exists to prevent.
  assert.deepEqual(bankFilterParts({ reason: 'duplicate' }, { labels: LABELS }),
    ['Rejected as: ≈ Duplicate'])
  assert.equal(bankFilterCount({ reason: 'duplicate' }, { labels: LABELS }), 1)
  // It reads after the status it belongs to, in the panel's own order.
  assert.deepEqual(
    bankFilterParts({ status: 'reject', reason: 'unrecorded' }, { labels: LABELS }),
    ['✕ Rejected', 'Rejected as: ❔ Not recorded'])
})

test('an unmapped reason id is still named', () => {
  assert.deepEqual(bankFilterParts({ reason: 'some_future_flag' }, { labels: LABELS }),
    ['Rejected as: some_future_flag'])
})

test('an empty-string subfolder is the bank root, and counts', () => {
  const parts = bankFilterParts({ subfolder: '' }, { labels: LABELS })
  assert.deepEqual(parts, ['📁 (bank root)'])
  assert.equal(bankFilterCount({ subfolder: '' }, { labels: LABELS }), 1)
})

test('a named subfolder reads as its path', () => {
  assert.deepEqual(bankFilterParts({ subfolder: 'outfit-a' }, { labels: LABELS }), ['📁 outfit-a'])
})

test('wd14 facet tags underscore-strip for display', () => {
  assert.deepEqual(bankFilterParts({ wd14Tags: ['blonde_hair', 'outdoors'] }, { labels: LABELS }),
    ['🔖 blonde hair', '🔖 outdoors'])
})

test('caption tags (comma-joined) split into one part each', () => {
  assert.deepEqual(bankFilterParts({ tags: 'red,dress' }, { labels: LABELS }),
    ['🏷️ red', '🏷️ dress'])
})

test('search and exclude are quoted and distinct', () => {
  assert.deepEqual(bankFilterParts({ search: 'red dress' }, { labels: LABELS }), ['🔍 “red dress”'])
  assert.deepEqual(bankFilterParts({ exclude: 'logo' }, { labels: LABELS }), ['🚫 “logo”'])
})

test('exclude and origin both count — the bug that dropped them from isFiltered', () => {
  assert.equal(bankFilterCount({ exclude: 'logo' }, { labels: LABELS }), 1)
  assert.equal(bankFilterCount({ origin: 'ai' }, { labels: LABELS }), 1)
})

test('overflow beyond max collapses to "+N more", full list stays in title', () => {
  const filter = { status: 'pending', flag: 'blur', resBucket: 'res_1_2', origin: 'ai', framing: 'face' }
  const s = bankFilterSummary(filter, { labels: LABELS, max: 3 })
  assert.equal(s.count, 5)
  assert.match(s.text, /\+2 more$/)
  assert.equal(s.parts.length, 5)
  assert.equal(s.title, s.parts.join(' · '))
})

test('parts stay in the panel reading order', () => {
  const filter = { exclude: 'x', search: 'y', status: 'keep', resBucket: 'res_1_2' }
  const parts = bankFilterParts(filter, { labels: LABELS })
  assert.deepEqual(parts, ['✓ Kept', '1–2 MP', '🔍 “y”', '🚫 “x”'])
})
