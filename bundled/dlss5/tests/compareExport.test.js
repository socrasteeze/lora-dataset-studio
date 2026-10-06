import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('the button only exists when a host offers the URL, and says it is working', () => {
  const src = read('../frontend/SideBySideVideo.jsx')
  assert.match(src, /\{exportHref && \(/)      // no prop, no button
  assert.match(src, /exporting \? 'Building' : '⬇ Export'/)
  assert.match(src, /disabled=\{exporting\}/)  // one click, not five
  assert.match(src, /role="alert"/)            // the failure is on screen
  // Finger-sized below lg through the shared control height.
  assert.match(src, /\$\{controlHeight\('sm'\)\} rounded-md border border-border px-2 py-0 text-xs/)
  const height = read('../../../frontend/src/components/common/controls.js')
  assert.match(height, /sm: 'h-10 min-h-10 lg:min-h-0 lg:h-7'/)
})
