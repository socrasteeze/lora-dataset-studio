import assert from 'node:assert/strict'
import test from 'node:test'

import { COVERAGE_PASSES, coverageBadges, coverageSummary } from './bankPassCoverage.js'

const cov = (over = {}) => ({
  scan: { pending: 0, done: 3, complete: true },
  score: { pending: 2, done: 1, complete: false },
  faces: { pending: 3, done: 0, complete: false },
  ...over,
})

test('a finished pass draws its glyph alone, a pending one draws the count', () => {
  const badges = coverageBadges(cov())
  const by = Object.fromEntries(badges.map((b) => [b.key, b]))

  assert.equal(by.scan.text, '🔎')
  assert.match(by.scan.title, /done/)
  assert.equal(by.score.text, '✨ 2')
  assert.match(by.score.title, /2 image\(s\) still to do/)
})

test('a pass that has never run reads as pending, not as a third state', () => {
  // For deciding what to queue, "never run" and "half done" are the same
  // question; the count already carries the difference.
  const [faces] = coverageBadges(cov()).filter((b) => b.key === 'faces')

  assert.equal(faces.text, '👥 3')
})

test('a missing pass draws nothing rather than a confident all-clear', () => {
  // An older cached payload, or a bank with no images at all. Inventing a
  // "done" badge there would be worse than saying nothing.
  const badges = coverageBadges({ scan: { pending: 0, done: 1, complete: true } })

  assert.deepEqual(badges.map((b) => b.key), ['scan'])
})

test('no coverage at all is no badges, never a crash', () => {
  assert.deepEqual(coverageBadges(undefined), [])
  assert.deepEqual(coverageBadges(null), [])
  assert.deepEqual(coverageBadges({}), [])
})

test('the summary counts only passes the server actually reported', () => {
  assert.equal(coverageSummary(cov()), '1 of 3 passes done')
  assert.equal(coverageSummary({}), '')
  assert.equal(coverageSummary(undefined), '')
})

test('the badges follow pipeline order, not object key order', () => {
  // Read left to right, they should match the order the passes run — otherwise
  // the card reads as an unordered pile of glyphs.
  const scrambled = { caption: { pending: 1, complete: false },
                      scan: { pending: 0, complete: true },
                      faces: { pending: 1, complete: false } }

  assert.deepEqual(coverageBadges(scrambled).map((b) => b.key),
                   ['scan', 'faces', 'caption'])
})

test('every badged pass is a real pipeline step', () => {
  // The keys are the server's step names. A typo here would silently draw
  // nothing forever, which is the failure mode hardest to notice.
  const steps = ['scan', 'score', 'watermark', 'faces', 'framing', 'caption']
  assert.deepEqual(COVERAGE_PASSES.map((p) => p.key), steps)
})
