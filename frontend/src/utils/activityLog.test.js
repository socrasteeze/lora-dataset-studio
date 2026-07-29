import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activityHeadline, formatAge, formatClock, mergeEvents, nextCursor,
  SLOW_AFTER_SECONDS, stallState, STUCK_AFTER_SECONDS,
} from './activityLog.js'

/* ── is it stuck? ──────────────────────────────────────────────────────────── */

test('a job reporting normally says nothing', () => {
  // Silence IS the good state. A green "healthy" chip on every row is noise
  // that makes the one row that matters harder to find.
  assert.equal(stallState(0), null)
  assert.equal(stallState(SLOW_AFTER_SECONDS - 1), null)
})

test('a job that has gone quiet is flagged, then called stuck', () => {
  const slow = stallState(SLOW_AFTER_SECONDS)
  assert.equal(slow.tone, 'warn')
  assert.match(slow.label, /no update for 1m/)
  const stuck = stallState(STUCK_AFTER_SECONDS)
  assert.equal(stuck.tone, 'error')
  assert.match(stuck.label, /probably stuck/)
})

test('an unknown age is neither fine nor alarming', () => {
  // "We don't know" must not render as a green tick, and must not cry wolf.
  assert.equal(stallState(null), null)
  assert.equal(stallState(undefined), null)
  assert.equal(stallState('nonsense'), null)
})

test('ages read the way a person would say them', () => {
  assert.equal(formatAge(8), '8s')
  assert.equal(formatAge(59), '59s')
  assert.equal(formatAge(180), '3m')
  assert.equal(formatAge(3840), '1h 4m')
  assert.equal(formatAge(-5), '0s')
})

/* ── the headline ──────────────────────────────────────────────────────────── */

const run = (over = {}) => ({ kind: 'bank', label: 'Dump', stale_seconds: 2, ...over })

test('the headline says the WORST thing that is true', () => {
  // "3 running" over a job that has said nothing for ten minutes is exactly the
  // sentence that made this panel necessary.
  const h = activityHeadline({
    running: [run(), run({ stale_seconds: 600 }), run()],
  })
  assert.equal(h.tone, 'error')
  assert.match(h.text, /1 of 3 running job\(s\) stopped reporting/)
})

test('a stale GPU flag with nothing running is called out by name', () => {
  const h = activityHeadline({ running: [], gpu_flags: { vision_in_progress: true } })
  assert.equal(h.tone, 'warn')
  assert.match(h.text, /Nothing is running, but the GPU is still marked busy/)
  assert.match(h.text, /stale/)
})

test('genuinely idle says so, and counts what is waiting', () => {
  assert.deepEqual(activityHeadline({ running: [], gpu_flags: {} }),
    { tone: 'ok', text: 'Idle.' })
  const queued = activityHeadline({
    running: [], gpu_flags: {}, bank_queue: { items: [{ bank_id: 1 }, { bank_id: 2 }] },
  })
  assert.match(queued.text, /Idle — 2 bank\(s\) waiting/)
})

test('a healthy run counts what is running and what is behind it', () => {
  const h = activityHeadline({
    running: [run(), run()], bank_queue: { items: [{ bank_id: 3 }] },
  })
  assert.equal(h.tone, 'ok')
  assert.equal(h.text, '2 running, 1 waiting.')
})

test('an empty payload does not crash and claims nothing', () => {
  assert.equal(activityHeadline(null).text, 'Idle.')
  assert.equal(activityHeadline({}).text, 'Idle.')
})

/* ── the log itself ────────────────────────────────────────────────────────── */

const ev = (id) => ({ id, at: 1000 + id, source: 'bank', message: `m${id}`, level: 'info' })

test('events APPEND rather than replace — a redraw loses the scroll position', () => {
  const first = mergeEvents([], [ev(1), ev(2)])
  const second = mergeEvents(first, [ev(3)])
  assert.deepEqual(second.map((e) => e.id), [1, 2, 3])
})

test('a re-sent event never appears twice', () => {
  const merged = mergeEvents([ev(1), ev(2)], [ev(2), ev(3)])
  assert.deepEqual(merged.map((e) => e.id), [1, 2, 3])
})

test('out-of-order arrivals are sorted by id, not by arrival', () => {
  assert.deepEqual(mergeEvents([ev(3)], [ev(1), ev(2)]).map((e) => e.id), [1, 2, 3])
})

test('the list is capped, keeping the NEWEST — a log left open all night', () => {
  const many = Array.from({ length: 20 }, (_, i) => ev(i + 1))
  const capped = mergeEvents([], many, 5)
  assert.deepEqual(capped.map((e) => e.id), [16, 17, 18, 19, 20])
})

test('the cursor is the highest id, and undefined when there is nothing', () => {
  assert.equal(nextCursor([ev(1), ev(7), ev(3)]), 7)
  // undefined, not 0: `since=0` and "give me everything" must not differ.
  assert.equal(nextCursor([]), undefined)
  assert.equal(nextCursor(null), undefined)
})

test('timestamps render as a 24-hour clock, and junk renders as nothing', () => {
  assert.match(formatClock(0, 'en-GB'), /^\d{2}:\d{2}:\d{2}$/)
  assert.equal(formatClock('nonsense', 'en-GB'), '')
})
