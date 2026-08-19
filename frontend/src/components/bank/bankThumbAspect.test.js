/**
 * Image-bank thumbnails are 3:4 portrait on every surface that shows one.
 *
 * A landscape crop (the old fixed h-24 / h-36 tile, the square preview strip)
 * hides the body of a typical bank photo — the framing you are there to judge.
 * Pinning the ratio here is what stops a later "make the tiles shorter" pass
 * from restoring that crop on one surface and leaving the others portrait.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const PORTRAIT = /aspect-\[3\/4\]/

test('the bank grid tile is a 3:4 portrait crop, not a fixed-height landscape bar', () => {
  const tile = read('./BankTile.jsx')
  assert.match(tile, PORTRAIT)
  assert.doesNotMatch(tile, /\bh-24\b|\bh-36\b/)
  assert.doesNotMatch(tile, /size === 'S'/)
})

test('the bank-list preview strip matches the grid (3:4, not square)', () => {
  const page = read('../../pages/BankPage.jsx')
  assert.match(page, PORTRAIT)
  assert.doesNotMatch(page, /aspect-square/)
})

test('the duplicate picker uses the same 3:4 crop', () => {
  const dups = read('./DupGroupsPanel.jsx')
  assert.match(dups, PORTRAIT)
  assert.doesNotMatch(dups, /h-24 w-full object-cover/)
})
