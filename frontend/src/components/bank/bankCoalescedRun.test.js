import assert from 'node:assert/strict'
import test from 'node:test'
import { coalescedRun } from './bankCoalescedRun.js'

const settle = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms))

test('a burst of calls runs once', async () => {
  let runs = 0
  const soon = coalescedRun(async () => { runs += 1 }, 5)
  soon(); soon(); soon()
  await settle()
  assert.equal(runs, 1)
})

test('a call during a run earns one more run, never an overlap', async () => {
  let runs = 0
  let active = 0
  let peak = 0
  const soon = coalescedRun(async () => {
    runs += 1
    active += 1
    peak = Math.max(peak, active)
    await settle(20)
    active -= 1
  }, 1)
  soon()
  await settle(8)
  soon()
  await settle(8)
  soon()
  await settle(70)
  assert.equal(runs, 2)
  assert.equal(peak, 1)
})

test('cancel drops a scheduled run', async () => {
  let runs = 0
  const soon = coalescedRun(async () => { runs += 1 }, 5)
  soon()
  soon.cancel()
  await settle()
  assert.equal(runs, 0)
})
