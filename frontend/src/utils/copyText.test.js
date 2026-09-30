import assert from 'node:assert/strict'
import test from 'node:test'

import { clipboardUnavailableReason, copyText, execCommandCopy, writeFailureReason } from './copyText.js'

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

// A DOM double: records what the fallback did to the page.
function fakeDocument({ execResult = true, execThrows = false } = {}) {
  const log = { appended: [], removed: 0, copied: null, focusedBack: false }
  const previous = { focus: () => { log.focusedBack = true } }
  const doc = {
    activeElement: previous,
    body: { appendChild: (el) => { log.appended.push(el) } },
    createElement: () => {
      const el = {
        style: {}, attrs: {}, value: '',
        setAttribute(k, v) { this.attrs[k] = v },
        focus() {}, select() { log.selected = this.value }, setSelectionRange() {},
        remove() { log.removed += 1 },
      }
      return el
    },
    execCommand: (cmd) => {
      if (execThrows) throw new Error('nope')
      log.copied = { cmd, value: log.appended[0]?.value }
      return execResult
    },
  }
  return { doc, log }
}

test('plain http falls back to execCommand and reports success', async () => {
  const { doc, log } = fakeDocument()
  const env = { isSecureContext: false, navigator: {}, document: doc }
  assert.deepEqual(await copyText('lan text', env), { ok: true })
  assert.deepEqual(log.copied, { cmd: 'copy', value: 'lan text' })
  assert.equal(log.removed, 1, 'the hidden textarea is removed again')
  assert.equal(log.focusedBack, true, 'focus goes back to where it was')
})

test('a rejected clipboard write falls back to execCommand', async () => {
  const { doc, log } = fakeDocument()
  const err = new Error('denied')
  err.name = 'NotAllowedError'
  const env = { isSecureContext: true, navigator: { clipboard: { writeText: async () => { throw err } } }, document: doc }
  assert.deepEqual(await copyText('x', env), { ok: true })
  assert.equal(log.copied.value, 'x')
})

test('a working clipboard API never touches the DOM', async () => {
  const { doc, log } = fakeDocument()
  const env = { isSecureContext: true, navigator: { clipboard: { writeText: async () => {} } }, document: doc }
  assert.deepEqual(await copyText('x', env), { ok: true })
  assert.equal(log.appended.length, 0)
})

test('when the fallback fails too, the API reason is what the caller gets', async () => {
  const { doc, log } = fakeDocument({ execResult: false })
  const env = { isSecureContext: false, navigator: {}, document: doc }
  const out = await copyText('x', env)
  assert.equal(out.ok, false)
  assert.match(out.reason, /HTTPS or localhost/)
  assert.equal(log.removed, 1, 'cleans up after a refused copy')
})

test('an execCommand that throws is a failure, not an exception', async () => {
  const { doc, log } = fakeDocument({ execThrows: true })
  const env = { isSecureContext: false, navigator: {}, document: doc }
  assert.equal((await copyText('x', env)).ok, false)
  assert.equal(log.removed, 1)
})

test('execCommandCopy is false without a document', () => {
  assert.equal(execCommandCopy('x', {}), false)
  assert.equal(execCommandCopy('x', { document: {} }), false)
})
