import assert from 'node:assert/strict'
import test from 'node:test'

import { flagLine, staleFlagNotice, STOP_CONFIRM, stopSummary } from './globalStop.js'

/* ── the stale-flag banner ─────────────────────────────────────────────────── */

test('a leftover flag with nothing running is offered a way out', () => {
  const n = staleFlagNotice({
    any_set: true, stale: true,
    flags: { vision_in_progress: true, training_in_progress: false },
  })
  assert.equal(n.tone, 'warn')
  assert.match(n.text, /nothing is running/)
  assert.match(n.text, /GPU busy/)
  assert.match(n.action, /Clear it/)
})

test('a flag a LIVE pass owns gets no banner — it is correct', () => {
  // Offering "clear this" over a running pass invites someone to break their own
  // job, and the server refuses it anyway.
  assert.equal(staleFlagNotice({
    any_set: true, stale: false, flags: { vision_in_progress: true },
  }), null)
  assert.equal(staleFlagNotice({ any_set: false, stale: false }), null)
  assert.equal(staleFlagNotice(null), null)
})

test('the banner names which flag is stuck', () => {
  const both = staleFlagNotice({
    any_set: true, stale: true,
    flags: { training_in_progress: true, vision_in_progress: true },
  })
  assert.match(both.text, /a training run and a vision\/GPU pass/)
})

/* ── the stop report ───────────────────────────────────────────────────────── */

const T = (name, state, detail = '') => ({ name, state, detail })

test('the worst outcome sets the tone — a partial stop never reads as success', () => {
  // "4 of 5 stopped" is exactly the sentence that hides the one that did not.
  const s = stopSummary({
    targets: [T('Bank queue', 'stopped'), T('Training', 'failed'),
      T('ComfyUI', 'unconfirmed'), T('Generations', 'idle')],
  })
  assert.equal(s.tone, 'error')
  assert.match(s.headline, /could not be stopped/)
  assert.equal(s.targets[0].name, 'Training', 'the worst target is listed first')
})

test('an unconfirmed target is surfaced, not folded into a success', () => {
  const s = stopSummary({ targets: [T('Bank queue', 'stopped'), T('ComfyUI', 'unconfirmed')] })
  assert.equal(s.tone, 'warn')
  assert.match(s.headline, /could not be confirmed/)
})

test('everything stopped cleanly reads as a clean stop', () => {
  const s = stopSummary({ targets: [T('Bank queue', 'stopped'), T('Training', 'stopped')] })
  assert.equal(s.tone, 'ok')
  assert.match(s.headline, /Stopped 2 things/)
})

test('nothing running says so instead of claiming a stop', () => {
  const s = stopSummary({ targets: [T('Bank queue', 'idle'), T('Training', 'idle')] })
  assert.equal(s.tone, 'ok')
  assert.equal(s.headline, 'Nothing was running.')
})

test('an empty report does not crash and does not claim anything', () => {
  assert.equal(stopSummary(null).headline, 'Nothing was running.')
  assert.deepEqual(stopSummary({}).targets, [])
})

/* ── the flag line ─────────────────────────────────────────────────────────── */

test('a cleared flag says the GPU is free', () => {
  assert.match(flagLine({ cleared: ['vision_in_progress'] }), /GPU is free again/)
})

test('a HELD flag is never softened into a success', () => {
  // The trainer is still alive. Reporting the GPU as free here is the one lie
  // the whole verified-stop path exists to prevent.
  const line = flagLine({
    cleared: [],
    held: [{ key: 'training_in_progress', reason: 'the training process is still alive' }],
  })
  assert.match(line, /still marked busy/)
  assert.match(line, /still alive/)
})

test('a partial result states BOTH halves', () => {
  const line = flagLine({
    cleared: ['vision_in_progress'],
    held: [{ key: 'training_in_progress', reason: 'the training process is still alive' }],
  })
  assert.match(line, /free again/)
  assert.match(line, /still marked busy/)
})

test('nothing flagged says nothing', () => {
  assert.equal(flagLine({ cleared: [], held: [] }), null)
  assert.equal(flagLine(null), null)
})

/* ── the confirm ───────────────────────────────────────────────────────────── */

test('the confirm says what is lost, not "are you sure"', () => {
  assert.match(STOP_CONFIRM, /cancels queued and running/)
  assert.match(STOP_CONFIRM, /resume where they\s+stopped/)
  assert.match(STOP_CONFIRM, /mid-flight is lost/)
})
