import assert from 'node:assert/strict'
import test from 'node:test'

import { clipboardUnavailableReason, copyText, writeFailureReason } from './copyText.js'

const secure = (writeText) => ({ isSecureContext: true, navigator: { clipboard: { writeText } } })

test('a working clipboard copies and says nothing else', async () => {
  let written = null
  const out = await copyText('hello', secure(async (s) => { written = s }))
  assert.deepEqual(out, { ok: true })
  assert.equal(written, 'hello')
})

test('plain HTTP on a LAN address is named as the reason, not blamed on the build', async () => {
  // The shipped bug: the app opened on http://<lan-ip>:5000 has NO
  // navigator.clipboard at all, so the report was built fine and the toast
  // said "Could not build the report: Cannot read properties of undefined".
  const env = { isSecureContext: false, navigator: {} }
  assert.match(clipboardUnavailableReason(env), /secure origin/)
  const out = await copyText('report', env)
  assert.equal(out.ok, false)
  assert.match(out.reason, /HTTPS or localhost/)
})

test('a missing clipboard on a secure origin still gets a sentence', async () => {
  const env = { isSecureContext: true, navigator: {} }
  assert.equal(clipboardUnavailableReason(env), 'this browser did not offer a clipboard')
  assert.equal((await copyText('x', env)).ok, false)
})

test('a clipboard object without writeText counts as missing', () => {
  assert.ok(clipboardUnavailableReason({ isSecureContext: true, navigator: { clipboard: {} } }))
})

test('an unknown isSecureContext does not claim the origin is the problem', () => {
  // Some embedders do not expose it. Guessing "not HTTPS" there would send the
  // user off to fix a URL that was never wrong.
  const reason = clipboardUnavailableReason({ navigator: {} })
  assert.equal(reason, 'this browser did not offer a clipboard')
  assert.doesNotMatch(reason, /secure/)
})

test('a denied permission is reported as a permission problem', async () => {
  const err = new Error('Write permission denied.')
  err.name = 'NotAllowedError'
  const out = await copyText('x', secure(async () => { throw err }))
  assert.equal(out.ok, false)
  assert.match(out.reason, /blocked the clipboard/)
})

test('a wordless rejection still says something', () => {
  assert.match(writeFailureReason(new Error('')), /without saying why/)
  assert.match(writeFailureReason(undefined), /without saying why/)
})

test('copyText never throws, whatever the clipboard does', async () => {
  const out = await copyText('x', secure(() => { throw new TypeError('boom') }))
  assert.deepEqual(out, { ok: false, reason: 'boom' })
})

test('non-string input is coerced rather than crashing the write', async () => {
  let written
  await copyText(42, secure(async (s) => { written = s }))
  assert.equal(written, '42')
  await copyText(null, secure(async (s) => { written = s }))
  assert.equal(written, '')
})
