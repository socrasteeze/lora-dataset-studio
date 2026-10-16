import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { curationSummary, emptyCurationPolicy, policyForKind, selectionContextKey,
  selectionRequest, targetRows } from './curationPolicy.js'

const metadata = { kinds: [{ id: 'character', axis: 'framing' }, { id: 'concept', axis: 'view' },
  { id: 'style', axis: 'subject' }], axes: [{ id: 'framing', buckets: ['face', 'body'] }],
framing_weights: { face: 4, body: 2 } }

test('all kinds use server defaults and clear incompatible references and cutoffs', () => {
  const current = { ...emptyCurationPolicy(), match: 'face', reference_ids: [1],
    min_similarity: 0.8, locked_ids: [2], weights: { face: 10 } }
  for (const [kind, axis] of [['character', 'framing'], ['concept', 'view'], ['style', 'subject']]) {
    const result = policyForKind(current, kind, metadata)
    assert.equal(result.axis, axis)
    assert.equal(result.match, 'image')
    assert.deepEqual(result.reference_ids, [])
    assert.deepEqual(result.locked_ids, [2])
    assert.deepEqual(result.weights, {})
    assert.equal(result.min_similarity, '')
  }
})

test('request serialization preserves explicit zero and never mutates the live policy', () => {
  const policy = { ...emptyCurationPolicy(), min_similarity: '0', reference_ids: [1], weights: { face: 0 } }
  const result = selectionRequest(policy)
  assert.equal(result.min_similarity, 0)
  assert.equal(result.weights.face, 0)
  result.reference_ids.push(2)
  result.weights.face = 1
  assert.deepEqual(policy.reference_ids, [1])
  assert.equal(policy.weights.face, 0)
  assert.equal(selectionRequest(emptyCurationPolicy()).min_similarity, null)
})

test('request contexts change with bank, filter, engine, model or policy', () => {
  const context = { bankId: 1, filter: { status: 'keep' }, engine: 'clip', modelKey: 'a', policy: emptyCurationPolicy() }
  const first = selectionContextKey(context)
  for (const patch of [{ bankId: 2 }, { filter: { status: 'pending' } }, { engine: 'siglip2' },
    { modelKey: 'b' }, { policy: { ...context.policy, locked_ids: [2] } }]) {
    assert.notEqual(selectionContextKey({ ...context, ...patch }), first)
  }
})

test('target controls preserve server weights, unknowns, discovered buckets and explicit exclusions', () => {
  const policy = { ...emptyCurationPolicy(), axis: 'framing', weights: { face: 0 } }
  const rows = targetRows(policy, metadata, { axis: 'framing', buckets: [{ key: 'back' }] })
  assert.equal(rows.find((row) => row.key === 'face').weight, 0)
  assert.equal(rows.find((row) => row.key === 'body').weight, 2)
  assert.equal(rows.find((row) => row.key === 'unknown').weight, 1)
  assert.ok(rows.some((row) => row.key === 'back'))
})

test('report copy distinguishes a shortlist from accepted training images', () => {
  assert.match(curationSummary({ selected: 5, requested: 10, kind: 'style' }), /5 of 10 selected for style/)
  assert.match(curationSummary({ selected: 5, requested: 10, kind: 'style' }), /Review before Keep or Promote/)
})

test('all three selectors render the same policy controls and one review report', () => {
  const source = fs.readFileSync(new URL('./BankWorkspace.jsx', import.meta.url), 'utf8')
  assert.equal((source.match(/<CurationPolicyControls /g) || []).length, 3)
  for (const mode of ['similar', 'diverse', 'balanced']) assert.ok(source.includes(`mode="${mode}"`))
  assert.match(source, /<CurationSelectionReport/)
  assert.match(source, /if \(on && !\(order \|\| \[\]\)\.length\)/)
  const hook = fs.readFileSync(new URL('./useCurationLanes.js', import.meta.url), 'utf8')
  assert.match(hook, /selectionCurrent\(request\)/)
  assert.match(hook, /similarLast\.contextKey !== contextKey/)
})
