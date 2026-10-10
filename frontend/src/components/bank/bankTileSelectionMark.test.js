/**
 * The selection mark and the badge cluster share the tile's top-left corner.
 * The badges render later, so without an offset they painted over the mark and
 * a selected tile showed only its ring.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('the mark sits in the top-left corner', () => {
  const mark = read('../shared/SelectionMark.jsx')
  assert.match(mark, /absolute left-1 top-1/)
})

test('a selected tile moves its badges right of the mark', () => {
  const tile = read('./BankTile.jsx')
  assert.match(tile, /selected\s*\?\s*'left-8 [^']*'\s*:\s*'left-1 [^']*'/)
  assert.doesNotMatch(tile, /"absolute left-1 top-1 flex flex-wrap/)
})
