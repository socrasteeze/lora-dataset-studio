import test from 'node:test'
import assert from 'node:assert/strict'
import { BANK_BULK_LIMIT, bankSelectionKey, successfulBulkKeys } from './bankBulk.js'
import { createBankMoveBatch, runBankMoveBatch } from './bankProfileMove.js'

const banks = [
  { id: 1, instance_id: 'a'.repeat(32), name: 'Example One' },
  { id: 2, instance_id: 'b'.repeat(32), name: 'Example Two' },
  { id: 3, instance_id: 'c'.repeat(32), name: 'Example Three' },
]
const profile = 'd'.repeat(32)
const ack = (id) => ({ ok: true, moved: true, bank_id: id + 100, profile_id: profile })
function batch(items = banks) {
  let sequence = 0
  return createBankMoveBatch(items, profile, () => (++sequence).toString(16).padStart(32, '0'))
}

test('Banks move sequentially and acknowledged results keep source selection identities', async () => {
  const operation = batch()
  const sent = [], results = [], progress = []
  let active = 0
  await runBankMoveBatch(operation, {
    post: async (url, body) => {
      assert.equal(active++, 0)
      sent.push({ url, body })
      await Promise.resolve()
      active--
      return ack(sent.length)
    },
    onResult: (row) => results.push(row), onProgress: (value) => progress.push(value),
  })
  assert.deepEqual([...successfulBulkKeys(results)], banks.map(bankSelectionKey))
  assert.equal(sent.length, 3)
  assert.equal(sent[0].url, '/api/profiles/banks/1/move')
  assert.deepEqual(sent[0].body, {
    instance_id: banks[0].instance_id, profile_id: profile, operation_id: '0'.repeat(31) + '1',
  })
  assert.deepEqual(progress.at(-1), { processed: 3, total: 3 })
})

test('partial failures retain exact retry identities without resending confirmed moves', async () => {
  const operation = batch()
  const firstPayloads = [], retryPayloads = []
  const first = await runBankMoveBatch(operation, {
    post: async (url, body) => {
      firstPayloads.push({ url, body })
      if (url.includes('/2/')) throw Object.assign(new Error('Example conflict'), { status: 409 })
      return ack(firstPayloads.length)
    }, onResult() {}, onProgress() {},
  })
  assert.deepEqual(first.map((row) => row.ok), [true, false])
  const retried = await runBankMoveBatch(operation, {
    post: async (url, body) => { retryPayloads.push({ url, body }); return ack(2) },
    onResult() {}, onProgress() {},
  })
  assert.deepEqual(retryPayloads[0], firstPayloads[1])
  assert.deepEqual(retryPayloads.map((row) => row.url), ['/api/profiles/banks/2/move', '/api/profiles/banks/3/move'])
  assert.equal(retried[0].ok, true)
  assert.equal(operation.completed.size, 3)
})

test('a lost acknowledgement stops before the next Bank and retries the recorded move first', async () => {
  const operation = batch(banks.slice(0, 2))
  const sent = []
  const result = await runBankMoveBatch(operation, {
    post: async (url, body) => { sent.push({ url, body }); throw new Error('Network error') },
    onResult() {}, onProgress() {},
  })
  assert.equal(sent.length, 1)
  assert.equal(result[0].unknown, true)
  assert.equal(operation.completed.size, 0)
  const retried = []
  await runBankMoveBatch(operation, {
    post: async (url, body) => { retried.push({ url, body }); return ack(retried.length) },
    onResult() {}, onProgress() {},
  })
  assert.deepEqual(retried[0], sent[0])
  assert.equal(retried.length, 2)
  assert.equal(operation.completed.size, 2)
})

test('an invalid destination acknowledgement never removes a source selection', async () => {
  const operation = batch()
  const results = await runBankMoveBatch(operation, {
    post: async () => ({ ...ack(1), profile_id: 'e'.repeat(32) }),
    onResult() {}, onProgress() {},
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].unknown, true)
  assert.equal(operation.completed.size, 0)
  assert.equal(successfulBulkKeys(results).size, 0)
})

test('ambiguous or oversized selections are refused before a move can be submitted', () => {
  assert.throws(() => batch([banks[0], banks[0]]))
  assert.throws(() => batch([{ id: 1 }]))
  assert.throws(() => batch([]))
  assert.throws(() => batch(Array(BANK_BULK_LIMIT + 1).fill(banks[0])))
})
