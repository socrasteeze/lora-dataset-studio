/**
 * Image-bank thumbnails are 3:4 portrait on every surface that shows one. The
 * grid alone can switch shape, and it shows the whole image in every shape.
 *
 * A landscape crop (the old fixed h-24 / h-36 tile, the square preview strip)
 * hides the body of a typical bank photo — the framing you are there to judge.
 * Pinning the ratio here is what stops a later "make the tiles shorter" pass
 * from restoring that crop on one surface and leaving the others portrait.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { TILE_SHAPE_STORAGE_KEY, loadTileShape, saveTileShape, tileShapeFrame } from './bankLayout.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const PORTRAIT = /aspect-\[3\/4\]/

test('the bank grid tile defaults to 3:4, switches shape, and never crops', () => {
  const tile = read('./BankTile.jsx')
  assert.match(tile, /tileShapeFrame\(shape\)/)
  assert.match(tile, /object-contain/)
  assert.doesNotMatch(tile, /object-cover/)
  assert.doesNotMatch(tile, /\bh-24\b|\bh-36\b/)
  assert.doesNotMatch(tile, /size === 'S'/)
  assert.equal(loadTileShape(null), '3:4')
  assert.match(tileShapeFrame('3:4'), PORTRAIT)
  assert.equal(tileShapeFrame('4:3'), 'aspect-[4/3]')
  assert.equal(tileShapeFrame('1:1'), 'aspect-square')
  assert.match(tileShapeFrame('corrupt'), PORTRAIT)
})

test('the thumbnail shape is remembered, and a bad stored value falls back', () => {
  const data = {}
  const store = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v } }
  saveTileShape('1:1', store)
  assert.equal(loadTileShape(store), '1:1')
  data[TILE_SHAPE_STORAGE_KEY] = 'wide'
  assert.equal(loadTileShape(store), '3:4')
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
