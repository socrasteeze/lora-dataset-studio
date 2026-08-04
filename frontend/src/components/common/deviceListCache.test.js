/* The device list is fetched once per kind, not once per picker.
 *
 * The wrong version this pins: `DevicePicker` called
 * `apiFetch('/api/cluster/devices?kind=…')` directly from its own effect, so
 * every mount was a request. Two pickers are commonly mounted at once — the
 * bank workspace holds one and opening the Launch-all dialog mounts a second —
 * and each request makes the hub run `local_capabilities()` plus a probe per
 * configured ComfyUI backend. A test that only asserted "returns the devices"
 * would have passed against that version too; the call COUNT is the point.
 */
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'

import {
  DEVICE_LIST_TTL_MS,
  clearDeviceListCache,
  fetchDeviceList,
} from './deviceListCache.js'

function counter(devices = [{ id: 'local' }, { id: 'peer-1' }]) {
  const calls = []
  const fetcher = (url) => {
    calls.push(url)
    return Promise.resolve({ devices })
  }
  return { calls, fetcher }
}

beforeEach(() => clearDeviceListCache())

test('two pickers of the same kind share one request', async () => {
  const { calls, fetcher } = counter()
  const clock = () => 1000

  const [a, b] = await Promise.all([
    fetchDeviceList('comfy', fetcher, clock),
    fetchDeviceList('comfy', fetcher, clock),
  ])

  assert.equal(calls.length, 1)
  assert.deepEqual(a, b)
  assert.deepEqual(a.map((d) => d.id), ['local', 'peer-1'])
})

test('a different kind is a different list, never a shared one', async () => {
  // The two kinds do not offer the same devices — `bank-pass` filters out
  // ComfyUI backends entirely — so sharing across kinds would be a real bug.
  const { calls, fetcher } = counter()
  const clock = () => 1000

  await fetchDeviceList('comfy', fetcher, clock)
  await fetchDeviceList('bank-pass', fetcher, clock)

  assert.equal(calls.length, 2)
  assert.ok(calls[0].includes('kind=comfy'))
  assert.ok(calls[1].includes('kind=bank-pass'))
})

test('the list is refetched once it goes stale', async () => {
  const { calls, fetcher } = counter()
  let now = 1000

  await fetchDeviceList('comfy', fetcher, () => now)
  now += DEVICE_LIST_TTL_MS + 1
  await fetchDeviceList('comfy', fetcher, () => now)

  assert.equal(calls.length, 2)
})

test('a failed lookup is not cached, so the next picker retries', async () => {
  // Caching a failure would serve an empty device list for the whole TTL, and
  // an empty list makes the picker hide itself — the peer would simply vanish
  // from the UI for as long as the entry lived.
  const calls = []
  let fail = true
  const fetcher = (url) => {
    calls.push(url)
    if (fail) return Promise.reject(new Error('offline'))
    return Promise.resolve({ devices: [{ id: 'local' }] })
  }
  const clock = () => 1000

  const first = await fetchDeviceList('comfy', fetcher, clock)
  assert.deepEqual(first, [])

  fail = false
  const second = await fetchDeviceList('comfy', fetcher, clock)

  assert.equal(calls.length, 2)
  assert.deepEqual(second.map((d) => d.id), ['local'])
})

test('a response with no devices key reads as an empty list, not a crash', async () => {
  const fetcher = () => Promise.resolve({})
  assert.deepEqual(await fetchDeviceList('comfy', fetcher, () => 1000), [])
})
