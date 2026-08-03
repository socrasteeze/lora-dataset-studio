/**
 * A missing id list and an empty one are different answers.
 *
 * The bug these pin: `d.ids || []` reported a stale backend's answer — which has
 * no `ids` key at all, because it predates `ids_only` and Flask ignores query
 * args it does not know — as "your filter matches nothing", while the grid
 * beside it showed 1,128 images. See bankIds.js.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { idsFromResponse, STALE_BACKEND_MESSAGE } from './bankIds.js'

test('a real id list comes back as-is, in order', () => {
  assert.deepEqual(idsFromResponse({ ids: [7, 3, 9] }), [7, 3, 9])
})

test('an EMPTY list is a valid answer, not an error', () => {
  // A filter that genuinely matches nothing must stay quiet — this is the case
  // the guard must NOT turn into a scary message.
  assert.deepEqual(idsFromResponse({ ids: [] }), [])
})

test('a response with NO ids key is refused instead of read as empty', () => {
  // Exactly what an older backend returns for ids_only=1: an ordinary grid page.
  const stale = { images: [{ id: 1 }, { id: 2 }], total: 1128, offset: 0 }
  assert.throws(() => idsFromResponse(stale), /older version than this page/)
})

test('the refusal names the remedy the user can actually act on', () => {
  // The whole point of the fix: not "something went wrong", but which thing to
  // restart. A message that only said "failed" would send them back to the
  // filters, which is where the original bug already sent them.
  assert.match(STALE_BACKEND_MESSAGE, /Restart LDS/)
  try {
    idsFromResponse({ total: 0 })
    assert.fail('a body with no ids key must throw')
  } catch (e) {
    assert.equal(e.message, STALE_BACKEND_MESSAGE)
  }
})

test('a non-array ids value is refused too, not spread into nonsense', () => {
  for (const bad of [{ ids: null }, { ids: 'abc' }, { ids: 42 }, { ids: {} }, {}, null]) {
    assert.throws(() => idsFromResponse(bad), /older version than this page/,
      `should refuse ${JSON.stringify(bad)}`)
  }
})
