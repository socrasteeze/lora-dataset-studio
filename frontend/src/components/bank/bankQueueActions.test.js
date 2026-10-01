import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearWaitingConfirm, removeQueuedConfirm, runningItems, stopRunningConfirm, waitingItems,
} from './bankQueueActions.js'

const NAMES = { 1: 'Alpha', 2: 'Bravo', 3: 'Charlie', 4: 'Delta' }
const nameOf = (id) => NAMES[id] || `Bank ${id}`
const queue = (...states) => ({
  items: states.map((state, i) => ({ bank_id: i + 1, state, position: i + 1 })),
})

test('waiting and running are split by state', () => {
  const q = queue('running', 'pending', 'pending')
  assert.deepEqual(runningItems(q).map((i) => i.bank_id), [1])
  assert.deepEqual(waitingItems(q).map((i) => i.bank_id), [2, 3])
  assert.deepEqual(runningItems(null), [])
  assert.deepEqual(waitingItems(undefined), [])
})

test('Clear waiting names the count and says the running bank keeps going', () => {
  assert.equal(clearWaitingConfirm(queue('running', 'pending', 'pending')),
    'Remove 2 waiting banks? The running bank keeps going.')
  assert.equal(clearWaitingConfirm(queue('pending')), 'Remove 1 waiting bank?')
  assert.equal(clearWaitingConfirm(queue('running', 'running', 'pending')),
    'Remove 1 waiting bank? The running banks keep going.')
})

test('Clear waiting has nothing to ask when nothing waits', () => {
  assert.equal(clearWaitingConfirm(queue('running')), null)
  assert.equal(clearWaitingConfirm({ items: [] }), null)
})

test('Stop running names the bank and keeps its finished steps', () => {
  assert.equal(stopRunningConfirm(queue('running'), nameOf),
    'Stop Alpha? Its finished steps are kept.')
  // With banks waiting, the next one starts: say so, it is part of the effect.
  assert.equal(stopRunningConfirm(queue('running', 'pending'), nameOf),
    'Stop Alpha? Its finished steps are kept. The next waiting bank then starts.')
})

test('Stop running names every running bank when several machines run one each', () => {
  assert.equal(stopRunningConfirm(queue('running', 'running'), nameOf),
    'Stop 2 running banks (Alpha, Bravo)? Their finished steps are kept.')
  assert.equal(stopRunningConfirm(queue('pending'), nameOf), null)
})

test('the ✕ asks only on the running row, with the same question as Stop', () => {
  const q = queue('running', 'pending')
  assert.equal(removeQueuedConfirm(q, nameOf, 2), null, 'a waiting row is one tap')
  assert.equal(removeQueuedConfirm(q, nameOf, 1),
    'Stop Alpha? Its finished steps are kept. The next waiting bank then starts.')
  assert.equal(removeQueuedConfirm(q, nameOf, 99), null, 'an unknown id asks nothing')
})
