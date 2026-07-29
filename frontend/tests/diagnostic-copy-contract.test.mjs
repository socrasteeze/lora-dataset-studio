/* The diagnostic report's two failure modes must stay two failure modes.
 *
 * Shipped bug: build and copy sat in ONE try/catch, so a browser that refuses
 * the clipboard (any non-HTTPS origin — i.e. every LAN / Tailscale address this
 * app is opened on) produced "Could not build the report: …" about a report
 * that had built perfectly, and the text was discarded. Testing on localhost
 * hides it completely: navigator.clipboard exists there.
 *
 * These are string assertions against the JSX because `node --test` cannot
 * parse JSX; the reason-wording itself is unit-tested in
 * src/utils/copyText.test.js.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const src = fs.readFileSync(new URL('../src/components/common/DiagnosticReport.jsx', import.meta.url), 'utf8')

test('the build failure and the clipboard failure are reported separately', () => {
  // The build has its own try, and it returns rather than falling through into
  // the copy.
  assert.match(src, /catch \(err\) \{[\s\S]*?Could not build the report[\s\S]*?return\s*\n?\s*\}/)
  // The clipboard is NOT inside that try — it goes through the helper, which
  // never throws and reports why.
  assert.match(src, /const out = await copyText\(text\)/)
  assert.doesNotMatch(src, /clipboard\.writeText/, 'use copyText() so the reason is reported, not swallowed')
})

test('a refused clipboard says the report was built and names the reason', () => {
  assert.match(src, /The report is ready, but \$\{out\.reason\}/)
})

test('a refused clipboard shows the text so it can be copied by hand', () => {
  // Unlike every other copy button in the app, this text is not already on
  // screen — "it stays selectable" is only true if we render it.
  assert.match(src, /setFallback\(text\)/)
  assert.match(src, /<textarea[^>]*readOnly[^>]*value=\{fallback\}/)
  // …and it is focused + pre-selected, so Ctrl/Cmd+C is the only key needed.
  assert.match(src, /box\.current\.focus\(\); box\.current\.select\(\)/)
})

test('a successful copy does not leave the fallback box on screen', () => {
  // setFallback(null) at the top of every attempt: a copy that works after one
  // that did not must not keep showing the old report.
  assert.match(src, /const copy = async \(\) => \{\s*\n\s*setBusy\(true\)\s*\n\s*setFallback\(null\)/)
})
