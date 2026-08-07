import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROMOTE_DESTINATIONS, canStartPromote, formatWeight, promoteButtonLabel,
  promoteCount, promoteSummary, weightNotice,
} from './bankPromote.js'

test('three destinations, the two dataset doors adjacent', () => {
  // The dialog RENDERS from this list, so it cannot drift from the tabs. Labels
  // are short deliberately: three tabs have to survive a 400 px viewport.
  assert.deepEqual(PROMOTE_DESTINATIONS.map((d) => d.id),
    ['dataset', 'new-dataset', 'bank'])
  assert.ok(PROMOTE_DESTINATIONS.every((d) => typeof d.label === 'string' && d.label))
})

test('formatWeight scales, and refuses to invent a number', () => {
  assert.equal(formatWeight(0), '0 B')
  assert.equal(formatWeight(900), '900 B')
  assert.equal(formatWeight(1024 * 300), '300 KB')
  assert.equal(formatWeight(1024 * 1024 * 62), '62 MB')
  // video-scale: the case the line exists for
  assert.equal(formatWeight(1024 * 1024 * 1024 * 1.44), '1.4 GB')
  assert.equal(formatWeight(null), null)
  assert.equal(formatWeight(undefined), null)
  assert.equal(formatWeight(-1), null)
})

test('the weight is announced for a new bank, and only once measured', () => {
  const notice = weightNotice({ destination: 'bank', size: { count: 200, bytes: 65e6 } })
  assert.match(notice, /62 MB/)
  assert.match(notice, /never share a file/)
  // not measured yet -> say so rather than show a confident 0
  assert.match(weightNotice({ destination: 'bank', size: null }), /Measuring/)
  assert.match(weightNotice({ destination: 'bank', size: { count: 2 } }), /Measuring/)
})

test('a dataset promotion never quotes a weight that de-duplication can reduce', () => {
  assert.equal(weightNotice({ destination: 'dataset', size: { bytes: 65e6 } }), null)
})

test('promoteCount prefers the selection, then the per-target count', () => {
  assert.equal(promoteCount({ useSelection: true, selectedCount: 200 }), 200)
  assert.equal(promoteCount({ useSelection: false, promotable: 42 }), 42)
  assert.equal(promoteCount({ useSelection: false, size: { count: 7 } }), 7)
  assert.equal(promoteCount({ useSelection: false }), null)
})

test('the new-bank summary says analysis and triage decisions travel', () => {
  const s = promoteSummary({ destination: 'bank', useSelection: true, selectedCount: 200 })
  assert.match(s, /200 image\(s\)/)
  assert.match(s, /COPIED/)
  assert.match(s, /analysis/)
  assert.match(s, /keep\/pending\/reject decisions intact/)
  assert.match(s, /keeps every one of them, marked as promoted/)
})

test('the dataset summary promises byte preservation for Bank analysis', () => {
  const s = promoteSummary({
    destination: 'dataset', useSelection: false, promotable: 12, datasetChosen: true,
  })
  assert.match(s, /12 kept image\(s\) not yet in this dataset/)
  assert.match(s, /byte-for-byte/)
  assert.match(s, /Bank analysis can travel/)
  assert.match(s, /source folder are left as they are/)
  const none = promoteSummary({ destination: 'dataset', useSelection: false, datasetChosen: false })
  assert.match(none, /chosen dataset/)
})

test('the button arms only when its destination is actually specified', () => {
  assert.equal(canStartPromote({ destination: 'dataset', datasetId: '' }), false)
  assert.equal(canStartPromote({ destination: 'dataset', datasetId: '3' }), true)
  assert.equal(canStartPromote({ destination: 'bank', bankName: '   ' }), false)
  assert.equal(canStartPromote({ destination: 'bank', bankName: 'Candidates' }), true)
  // ...and never twice
  assert.equal(canStartPromote({ destination: 'bank', bankName: 'C', busy: true }), false)
})

test('the button names what it makes', () => {
  assert.equal(promoteButtonLabel({ destination: 'bank' }), 'Create bank')
  assert.equal(promoteButtonLabel({ destination: 'dataset' }), 'Promote')
  assert.equal(promoteButtonLabel({ destination: 'bank', busy: true }), 'Starting…')
})

/* ── the third door: a dataset that does not exist yet ─────────────────────── */

test('a new dataset needs BOTH a name and a trigger', () => {
  const arm = (over) => canStartPromote({ destination: 'new-dataset', ...over })
  assert.equal(arm({ datasetName: 'Emma', datasetTrigger: 'zchar_emma' }), true)
  assert.equal(arm({ datasetName: '', datasetTrigger: 'zchar_emma' }), false)
  assert.equal(arm({ datasetName: 'Emma', datasetTrigger: '' }), false)
  assert.equal(arm({ datasetName: '  ', datasetTrigger: '  ' }), false)
  // …and it must not fire twice.
  assert.equal(arm({ datasetName: 'Emma', datasetTrigger: 'z', busy: true }), false)
})

test('a dataset target is irrelevant to the new-dataset door', () => {
  // Guards against a copy-paste that made the third door depend on datasetId.
  assert.equal(canStartPromote({
    destination: 'new-dataset', datasetId: '', datasetName: 'Emma',
    datasetTrigger: 'zchar_emma',
  }), true)
})

test('the button names what it makes', () => {
  assert.equal(promoteButtonLabel({ destination: 'new-dataset' }), 'Create dataset')
  assert.equal(promoteButtonLabel({ destination: 'bank' }), 'Create bank')
  assert.equal(promoteButtonLabel({ destination: 'dataset' }), 'Promote')
  assert.equal(promoteButtonLabel({ destination: 'new-dataset', busy: true }), 'Starting…')
})

test('the new-dataset summary never says "the chosen dataset"', () => {
  // The branch-order trap: the `!useSelection && !datasetChosen` early return
  // below it would otherwise swallow this destination and describe a dataset
  // that is being named right now as one the user "chose".
  const line = promoteSummary({
    destination: 'new-dataset', useSelection: false, selectedCount: 0,
    size: { count: 12 }, datasetChosen: false,
  })
  assert.match(line, /brand-new dataset/)
  assert.match(line, /COPIED/)
  assert.match(line, /normalized to webp/)
  assert.doesNotMatch(line, /chosen dataset/)
  assert.match(line, /The 12 image\(s\)/, 'it counts from the measured size')
})

test('the weight line stays SILENT for a new dataset — webp makes it a lie', () => {
  // The instinct when adding a destination is to teach every helper about it.
  // Here the correct change is none: both dataset doors re-encode on the way in,
  // so quoting the source bytes would be a number the user could check and find
  // wrong. Only the byte-for-byte bank copy earns that sentence.
  assert.equal(weightNotice({ destination: 'new-dataset', size: { bytes: 65e6 } }), null)
  assert.equal(weightNotice({ destination: 'dataset', size: { bytes: 65e6 } }), null)
  // …and the bank door still does (62 MB, not 62.0 — formatWeight drops the
  // decimal at 10 and above).
  assert.match(weightNotice({ destination: 'bank', size: { bytes: 65e6 } }), /62 MB/)
})

/* ── the wiring the pure helpers cannot see ────────────────────────────────── */

test('the dialog renders its tabs FROM the constant, and posts the third route', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(
    new URL('./PromoteDialog.jsx', import.meta.url), 'utf8')
  // Rendered from the list, so a fourth destination cannot be added to one and
  // not the other.
  assert.match(src, /PROMOTE_DESTINATIONS\.map\(\(d\) => tab\(d\.id, d\.label\)\)/)
  assert.match(src, /grid-cols-1 gap-2 sm:grid-cols-3/)  // three tabs at 400 px
  assert.match(src, /promote-to-new-dataset/)
  assert.match(src, /trigger_word: newDsTrigger\.trim\(\)/)
  // Both gate call sites must carry the new fields, or the button and the
  // handler disagree about whether the form is complete.
  assert.equal(src.match(/datasetName: newDsName, datasetTrigger: newDsTrigger/g).length, 2)
  // The warning is advisory: it renders, but nothing about it disables anything.
  assert.match(src, /triggerWarning\(newDsTrigger, datasets\)/)
  // The dead-end note now points at the tab, not at another page.
  assert.match(src, /pick 🆕 New dataset above/)
  assert.doesNotMatch(src, /create one on the Datasets page first/)
})
