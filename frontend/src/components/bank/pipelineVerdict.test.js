import assert from 'node:assert/strict'
import test from 'node:test'

import { pipelineBadge, pipelineReportVerdict, queueOutcomeLine } from './pipelineVerdict.js'

const step = (name, status = 'done', reason = null) => ({ step: name, status, reason })
const report = (steps, over = {}) => ({ steps, ...over })

test('a clean run is ok and gets no badge', () => {
  // A green tick on every card is noise; it makes the one amber card harder to
  // spot, not easier.
  const v = pipelineReportVerdict(report([step('scan'), step('score')]))
  assert.equal(v.state, 'ok')
  assert.equal(pipelineBadge(v), null)
})

test('every GPU pass skipped for a busy GPU is PARTIAL, not ok', () => {
  // The night was wasted and the bank card looked identical to a clean run.
  const v = pipelineReportVerdict(report([
    step('scan'),
    step('score', 'skipped', 'GPU busy — a vision task is already running'),
    step('faces', 'skipped', 'GPU busy — a vision task is already running'),
  ]))
  assert.equal(v.state, 'partial')
  assert.equal(v.blocked, 2)
  assert.match(v.first_reason, /GPU busy/)
  const badge = pipelineBadge(v)
  assert.equal(badge.tone, 'warn')
  assert.match(badge.label, /2 passes skipped/)
  assert.match(badge.title, /score: GPU busy/)
})

test('a step that DECLINED ITSELF for a prerequisite is not flagged', () => {
  // semantic_dedup skipped for "run Score first" is the pipeline working as
  // designed. Nagging about it trains people to ignore the badge.
  const v = pipelineReportVerdict(report([
    step('scan'),
    step('semantic_dedup', 'skipped', 'no embeddings yet — run ✨ Score first'),
  ]))
  assert.equal(v.state, 'ok')
  assert.equal(v.skipped, 1, 'it is still counted…')
  assert.equal(v.blocked, 0, '…just not held against the run')
  assert.equal(pipelineBadge(v), null)
})

test('an errored step outranks everything else', () => {
  const v = pipelineReportVerdict(report([
    step('scan', 'error', 'RuntimeError: disk full'),
    step('score', 'skipped', 'GPU busy — training is running'),
  ]))
  assert.equal(v.state, 'error')
  assert.equal(v.errors, 1)
  assert.match(pipelineBadge(v).label, /1 step failed/)
  assert.match(pipelineBadge(v).title, /disk full/)
})

test('steps never reached count as blocked — the run stopped short', () => {
  const v = pipelineReportVerdict(report([
    step('scan'), step('score', 'skipped', 'not reached'),
  ]))
  assert.equal(v.state, 'partial')
  assert.equal(v.blocked, 1)
})

test('a user cancel is reported, but a cancel is not a fault', () => {
  const v = pipelineReportVerdict(report([
    step('scan'),
    step('score', 'cancelled', 'cancelled before it ran'),
  ], { cancelled: true }))
  assert.equal(v.cancelled, true)
  assert.equal(v.state, 'ok', 'the user stopped it on purpose — that is not a problem')
})

test('no report at all has no verdict — never a green tick on nothing', () => {
  assert.equal(pipelineReportVerdict(null), null)
  assert.equal(pipelineReportVerdict({}), null)
  assert.equal(pipelineReportVerdict({ steps: [] }), null)
  assert.equal(pipelineBadge(null), null)
})

test('the queue line says how many had problems, not just how many finished', () => {
  // "12 finished" is exactly the sentence that let a wasted night pass for a
  // good one.
  const ok = { state: 'ok' }
  const bad = { state: 'partial' }
  assert.equal(queueOutcomeLine([ok, ok, ok]), '3 finished.')
  assert.match(queueOutcomeLine([ok, bad, bad]), /1 finished, 2 with problems/)
  assert.equal(queueOutcomeLine([]), null)
  assert.equal(queueOutcomeLine(null), null)
})

test('singular and plural read correctly', () => {
  const one = pipelineReportVerdict(report([step('score', 'skipped', 'GPU busy — x')]))
  assert.match(pipelineBadge(one).label, /1 pass skipped/)
  const oneErr = pipelineReportVerdict(report([step('scan', 'error', 'boom')]))
  assert.match(pipelineBadge(oneErr).label, /1 step failed/)
})
