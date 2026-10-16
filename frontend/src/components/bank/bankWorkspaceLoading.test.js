import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeWorkspacePayload } from './bankWorkspaceLoading.js'

test('controls and runtime remain usable while the statistics promise is unresolved', async () => {
  let resolveStats
  let payload = null
  const stats = new Promise((resolve) => { resolveStats = resolve })
    .then((value) => { payload = mergeWorkspacePayload(payload, value) })
  const metadata = { id: 7, name: 'Example Bank', source_path: 'source', activity: null }
  payload = mergeWorkspacePayload(payload, metadata, { metadata: true })
  payload = mergeWorkspacePayload(payload, { id: 7, score_device: { device: 'cpu' } })
  assert.equal(payload.name, 'Example Bank')
  assert.equal(payload.source_path, 'source')
  assert.equal(payload.counts, undefined, 'unknown statistics must not become zero totals')
  assert.equal(payload.score_device.device, 'cpu')
  resolveStats({ id: 7, counts: { total: 4, keep: 1 } })
  await stats
  assert.equal(payload.counts.total, 4)
  assert.equal(payload.name, 'Example Bank')
  assert.equal(payload.score_device.device, 'cpu')
})

test('late metadata cannot revert a relocation or job state learned by a newer read', () => {
  const current = { id: 7, source_path: 'moved', counts: { keep: 2 }, activity: { finished: false } }
  const stale = { id: 7, name: 'Example Bank', source_path: 'original', activity: null }
  const merged = mergeWorkspacePayload(current, stale, { metadata: true })
  assert.equal(merged.source_path, 'moved')
  assert.equal(merged.activity.finished, false)
  assert.equal(merged.counts.keep, 2)
  assert.equal(merged.name, 'Example Bank')
  assert.equal(stale.source_path, 'original')
})

test('a runtime response that arrives first survives subsequent metadata and statistics', () => {
  let payload = mergeWorkspacePayload(null, { id: 7, score_device: { gpu: true } })
  payload = mergeWorkspacePayload(payload, { id: 7, name: 'Example Bank' }, { metadata: true })
  payload = mergeWorkspacePayload(payload, { id: 7, counts: { total: 3 } })
  assert.equal(payload.score_device.gpu, true)
  assert.equal(payload.name, 'Example Bank')
  assert.equal(payload.counts.total, 3)
})

for (const runtimeFirst of [true, false]) {
  test(`semantic counts and runtime readiness survive either arrival order (${runtimeFirst})`, () => {
    const stats = { id: 7, semantic: { engine: 'siglip2', counts: { ok: 3 }, ready: true } }
    const runtime = { id: 7, semantic: { engine: 'siglip2', device: { gpu: true }, text: { available: true } } }
    const [first, last] = runtimeFirst ? [runtime, stats] : [stats, runtime]
    const merged = mergeWorkspacePayload(first, last)
    assert.equal(merged.semantic.counts.ok, 3)
    assert.equal(merged.semantic.ready, true)
    assert.equal(merged.semantic.device.gpu, true)
    assert.equal(merged.semantic.text.available, true)
    assert.equal(stats.semantic.device, undefined)
    assert.equal(runtime.semantic.counts, undefined)
  })
}

test('a selected engine never inherits another engine runtime or cache counts', () => {
  const current = { id: 7, semantic: { engine: 'clip', device: { gpu: false }, counts: { ok: 4 } } }
  const next = { id: 7, semantic: { engine: 'siglip2', counts: { ok: 0 } } }
  assert.deepEqual(mergeWorkspacePayload(current, next).semantic, next.semantic)
})
