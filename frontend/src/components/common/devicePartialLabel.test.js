/* The picker names what a machine cannot do, instead of counting it.
 *
 * Wrong version this pins: the option label ended in a bare `(some passes)`,
 * computed from a hand-listed `bank_scoring && face_scoring && ollama` inside
 * the JSX. Two problems, and the naming is the smaller one — that hardcoded set
 * was a third copy of the capability rule, and it would not have noticed a new
 * gated pass being added on the server.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_NAMED, devicePartialLabel } from './devicePartialLabel.js'

const ok = (label) => ({ ok: true, blocked: false, label })
const no = (label) => ({ ok: false, blocked: true, label, reason: 'x' })

test('a machine that can run everything gets no suffix', () => {
  const device = { passes: { score: ok('✨ Score'), faces: ok('👥 Group by person') } }
  assert.equal(devicePartialLabel(device), '')
})

test('one blocked pass is named', () => {
  const device = { passes: { score: no('✨ Score'), faces: ok('👥 Group by person') } }
  assert.equal(devicePartialLabel(device), ' (no ✨ Score)')
})

test('two blocked passes are both named', () => {
  const device = { passes: { score: no('✨ Score'), faces: no('👥 Group by person') } }
  assert.match(devicePartialLabel(device), /✨ Score/)
  assert.match(devicePartialLabel(device), /👥 Group by person/)
})

test('past the cap it counts instead, so the option still fits', () => {
  const passes = {}
  for (let i = 0; i <= MAX_NAMED; i++) passes[`p${i}`] = no(`Pass ${i}`)
  const label = devicePartialLabel({ passes })
  assert.match(label, new RegExp(`${MAX_NAMED + 1} passes`))
  assert.doesNotMatch(label, /Pass 0/)
})

test('a device with no verdicts says nothing rather than guessing', () => {
  // This machine, an API backend, or a list fetched before verdicts existed.
  // Inventing "(some passes)" for any of them would be a lie the launch route
  // would then contradict.
  assert.equal(devicePartialLabel({ id: 'local', local: true }), '')
  assert.equal(devicePartialLabel({}), '')
  assert.equal(devicePartialLabel(null), '')
  assert.equal(devicePartialLabel(undefined), '')
})

test('a verdict with no label falls back to the step key, never to blank', () => {
  const device = { passes: { score: { blocked: true } } }
  assert.equal(devicePartialLabel(device), ' (no score)')
})

test('the order is stable, so the same machine reads the same on every screen', () => {
  const a = { passes: { faces: no('👥 Faces'), score: no('✨ Score') } }
  const b = { passes: { score: no('✨ Score'), faces: no('👥 Faces') } }
  assert.equal(devicePartialLabel(a), devicePartialLabel(b))
})
