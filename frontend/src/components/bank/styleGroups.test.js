import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sortStyleGroups, SMALL_STYLE_GROUP } from './styleGroups.js'

const groups = [
  { id: 1, size: 60, rejected: 0, aesthetic: 5.0 },
  { id: 2, size: 40, rejected: 30, aesthetic: 7.5 },
  { id: 3, size: 20, rejected: 0, aesthetic: null },
  { id: 4, size: 20, rejected: 0, aesthetic: 6.0 },
]

test('largest first counts only images that are not rejected', () => {
  assert.deepEqual(sortStyleGroups([...groups], 'size').map((g) => g.id), [1, 3, 4, 2])
})

test('best aesthetic first puts unscored groups last', () => {
  assert.deepEqual(sortStyleGroups([...groups], 'aesthetic').map((g) => g.id), [2, 4, 1, 3])
})

test('smallest first is the reverse of largest first', () => {
  assert.deepEqual(sortStyleGroups([...groups], 'small').map((g) => g.id), [2, 4, 3, 1])
})

test('hiding small groups uses the kept-or-undecided count', () => {
  assert.equal(SMALL_STYLE_GROUP, 15)
  assert.deepEqual(sortStyleGroups([...groups], 'size', SMALL_STYLE_GROUP).map((g) => g.id), [1, 3, 4])
})

test('the rail offers the browser, and the browser reads the full list', () => {
  const rail = fs.readFileSync(new URL('./BankFilterRail.jsx', import.meta.url), 'utf8')
  const browser = fs.readFileSync(new URL('./StyleGroupsBrowser.jsx', import.meta.url), 'utf8')
  assert.match(rail, /onBrowseStyles/)
  assert.match(browser, /\/api\/bank\/\$\{bankId\}\/style-groups/)
  assert.match(browser, /data-probe-layer/)
})
