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
