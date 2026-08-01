import assert from 'node:assert/strict'
import test from 'node:test'

import { queueAllCandidates, queueAllConfirm, queueAllResult } from './bankQueueAll.js'

const bank = (id, over = {}) => ({ id, name: `b${id}`, total: 10, keep: 0, reject: 0, ...over })

test('only banks with undecided images are candidates', () => {
  // A fully triaged bank has nothing for a pipeline to decide; queueing it pays
  // for a pass whose every step would find nothing.
  const rows = [bank(1), bank(2, { keep: 6, reject: 4 }), bank(3, { total: 0 })]
  assert.deepEqual(queueAllCandidates(rows, null).map((b) => b.id), [1])
})

test('a bank already in the queue is not counted again', () => {
  const rows = [bank(1), bank(2)]
  const queue = { items: [{ bank_id: 1, state: 'running' }] }
  assert.deepEqual(queueAllCandidates(rows, queue).map((b) => b.id), [2])
})

test('the confirm says they run ONE AT A TIME — that is the whole worry', () => {
  const c = queueAllConfirm([bank(1), bank(2)], ['scan', 'score'])
  assert.match(c, /Queue 2 banks/)
  assert.match(c, /ONE AT A TIME/)
  // "Nothing starts in parallel" stopped being true when each machine got its
  // own lane. The worry it answers has not changed — twelve banks must not
  // become twelve runs — so the sentence bounds the parallelism instead of
  // denying it.
  assert.match(c, /never twelve at once/)
  assert.match(c, /runs alongside/)
  assert.match(c, /2 passes per bank/)
  assert.match(c, /can cancel any of them/)
})

test('one bank, one pass reads correctly', () => {
  const c = queueAllConfirm([bank(1)], ['scan'])
  assert.match(c, /Queue 1 bank\?/)
  assert.match(c, /1 pass per bank/)
})

test('nothing to queue asks nothing', () => {
  assert.equal(queueAllConfirm([], ['scan']), null)
  assert.equal(queueAllConfirm(null, ['scan']), null)
})

test('the result toast comes from the SERVER counts, not the client guess', () => {
  // A bank triaged in another tab, or queued a second ago, makes the two
  // disagree — and the honest answer is to report what the server actually did.
  const r = queueAllResult({ queued: [{ bank_id: 1 }, { bank_id: 2 }], skipped: [] })
  assert.equal(r.type, 'success')
  assert.match(r.text, /2 bank\(s\) queued/)
  assert.match(r.text, /one at a time/)
})

test('skipped banks are named in the toast rather than silently dropped', () => {
  const r = queueAllResult({
    queued: [{ bank_id: 2 }],
    skipped: [{ bank_id: 1, reason: 'already queued' }],
  })
  assert.match(r.text, /1 bank\(s\) queued/)
  assert.match(r.text, /1 skipped \(already queued\)/)
})

test('a request that queued nothing says why, and is not a success', () => {
  const allSkipped = queueAllResult({ queued: [], skipped: [{ bank_id: 1 }] })
  assert.equal(allSkipped.type, 'info')
  assert.match(allSkipped.text, /already in the queue/)
  const nothing = queueAllResult({ queued: [], skipped: [] })
  assert.equal(nothing.type, 'info')
  assert.match(nothing.text, /every bank is fully triaged/)
  assert.equal(queueAllResult(null).type, 'info')
})
