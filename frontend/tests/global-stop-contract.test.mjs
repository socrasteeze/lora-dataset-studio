/* ⏹ Stop everything — the wiring the logic tests cannot see.
 *
 * globalStop.test.js pins the reporting rule (a partial stop never reads as
 * success). What a rewrite silently loses is the PLACEMENT: the recovery has to
 * sit where the refusal appears, or someone hitting "GPU busy" on the banks page
 * never finds it, and the whole change is a Settings panel nobody opens.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const notice = read('../src/components/common/GpuBusyNotice.jsx')
const panel = read('../src/components/settings/GlobalStopPanel.jsx')
const workspace = read('../src/components/bank/BankWorkspace.jsx')
const banks = read('../src/pages/BankPage.jsx')
const maintenance = read('../src/components/settings/MaintenanceSection.jsx')

test('the stuck-flag recovery sits where the refusal appears', () => {
  // Not only in Settings: the two places a "GPU busy" refusal is actually met.
  assert.match(workspace, /<GpuBusyNotice/)
  assert.match(banks, /<GpuBusyNotice/)
  assert.match(maintenance, /<GlobalStopPanel \/>/)
})

test('the notice renders only for a flag with nothing behind it', () => {
  // staleFlagNotice returns null unless the SERVER said stale. Rendering over a
  // live pass would invite someone to break their own running job.
  assert.match(notice, /const notice = staleFlagNotice\(state\)/)
  assert.match(notice, /if \(!notice\) return null/)
  assert.match(notice, /apiFetch\('\/api\/system\/gpu-flags'\)/)
  assert.match(notice, /postJson\('\/api\/system\/gpu-flags\/clear'/)
})

test('a refused clear is shown, not swallowed into a button that did nothing', () => {
  assert.match(notice, /setError\(e\.message/)
  assert.match(notice, /\{error && /)
})

test('the global stop confirms first and reports per target', () => {
  assert.match(panel, /window\.confirm\(STOP_CONFIRM\)/)
  assert.match(panel, /postJson\('\/api\/system\/stop-everything'/)
  assert.match(panel, /summary\.targets\.map/)
  // The per-target states are all rendered — an unconfirmed target must have a
  // label, or it silently reads like the others.
  for (const state of ['stopped', 'idle', 'unconfirmed', 'failed']) {
    assert.ok(panel.includes(`${state}:`), `${state} needs a label`)
  }
})

test('the flag line is rendered, so a HELD flag is visible', () => {
  // The one thing that must never be hidden: the trainer is still alive and the
  // GPU is still marked busy.
  assert.match(panel, /\{summary\.flags && /)
})
