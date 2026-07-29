import assert from 'node:assert/strict'
import test from 'node:test'

import { allExcludedWarning, normalizeExcluded, splitPlan } from './bankSplit.js'

const preview = (subs, loose = 0) => ({
  subfolders: subs.map(([name, image_count]) => ({ name, image_count })),
  loose_root_count: loose,
})

test('excluded subfolders drop out of the count, not out of the list', () => {
  // They stay on screen struck through — a folder that silently vanished from
  // the preview is indistinguishable from one the walk never found.
  const plan = splitPlan({
    preview: preview([['a', 3], ['huge', 40000], ['b', 2]]),
    excluded: ['huge'],
  })
  assert.equal(plan.rows.length, 3)
  assert.equal(plan.rows.find((r) => r.name === 'huge').excluded, true)
  assert.equal(plan.bankCount, 2)
  assert.equal(plan.imageCount, 5, 'the excluded 40 000 are not counted')
})

test('the loose row is a row like any other, and honours its own toggle', () => {
  const withLoose = splitPlan({ preview: preview([['a', 1]], 7), includeLoose: true })
  assert.equal(withLoose.bankCount, 2)
  assert.equal(withLoose.imageCount, 8)
  const without = splitPlan({ preview: preview([['a', 1]], 7), includeLoose: false })
  assert.equal(without.bankCount, 1)
  assert.equal(without.rows.find((r) => r.kind === 'loose').excluded, true)
})

test('no loose images means no loose row at all', () => {
  const plan = splitPlan({ preview: preview([['a', 1]], 0) })
  assert.equal(plan.rows.length, 1)
})

test('all subfolders excluded is flagged — it is the case the server refuses', () => {
  // The server's no-subfolder fallback imports the PARENT, which recurses into
  // everything just excluded. It refuses instead; the UI has to say so first.
  const plan = splitPlan({ preview: preview([['a', 1], ['b', 2]]), excluded: ['a', 'b'] })
  assert.equal(plan.allExcluded, true)
  assert.equal(plan.bankCount, 0)
})

test('excluding the loose row alone is NOT "all excluded"', () => {
  // Only subfolders decide it: the loose bank is what rescues the case.
  const plan = splitPlan({
    preview: preview([['a', 1]], 4), excluded: [], includeLoose: false,
  })
  assert.equal(plan.allExcluded, false)
})

test('a folder with no subfolders at all is not "all excluded"', () => {
  assert.equal(splitPlan({ preview: preview([], 5) }).allExcluded, false)
  assert.equal(splitPlan({ preview: null }).allExcluded, false)
})

test('the all-excluded warning names WHICH outcome, never a guess', () => {
  const plan = splitPlan({ preview: preview([['a', 1]], 6), excluded: ['a'] })
  const withLoose = allExcludedWarning(plan, { loose: 6, includeLoose: true })
  assert.match(withLoose, /Only the loose root images/)
  const nothing = allExcludedWarning(plan, { loose: 6, includeLoose: false })
  assert.match(nothing, /nothing left to import/)
  assert.match(nothing, /One bank per subfolder/, 'the way out is named')
  assert.equal(allExcludedWarning(splitPlan({ preview: preview([['a', 1]]) })), null)
})

test('normalizeExcluded takes a Set or an array and cleans both', () => {
  assert.deepEqual(normalizeExcluded(new Set(['b', 'a'])), ['a', 'b'])
  assert.deepEqual(normalizeExcluded(['  x  ', '', null, 'x']), ['x'])
  assert.deepEqual(normalizeExcluded(null), [])
})

test('an exclusion naming a folder that is not there changes nothing', () => {
  // e.g. the folder path changed but the tick state has not been reset yet.
  const plan = splitPlan({ preview: preview([['a', 1]]), excluded: ['gone'] })
  assert.equal(plan.bankCount, 1)
  assert.equal(plan.allExcluded, false)
})
