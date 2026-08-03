/* The Bank's four ③ Curate popovers (🎨 Pick diverse…, ⚖ Balanced pick…,
 * 🎯 Similar to selected…, 🔤 Find by text…) must all share the same
 * mobile-safe placement: a bottom sheet below `sm`, an anchored dropdown from
 * `sm` up.
 *
 * THE BUG THIS PINS. Two of the four (⚖ Balanced, 🔤 Find by text) already
 * carried this fix, with a comment on the latter recording that it was
 * MEASURED to overflow on a 400px viewport ("reached x=517... made the whole
 * page scroll sideways") before the fix. The other two (🎨 Diverse, 🎯
 * Similar) were left on the original `absolute z-50 mt-1 w-72` markup — no
 * left/right offset, so the popover renders at its STATIC position (wherever
 * its trigger button happens to sit in the wrapping "Curate" row) and can run
 * off the right edge of a phone screen exactly like the sibling did before it
 * was fixed. `node --test` cannot parse JSX and has no layout engine, so this
 * greps the source for both the fixed pattern (must be present, 4 times) and
 * the broken one (must be absent).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontend = path.resolve(here, '..')
const workspace = fs.readFileSync(path.join(frontend, 'src/components/bank/BankWorkspace.jsx'), 'utf8')

test('the broken static-position popover pattern is gone', () => {
  assert.doesNotMatch(workspace, /absolute z-50 mt-1 w-72/,
    'a Curate popover reverted to the anchored-with-no-offset markup that overflows a phone screen')
})

test('all four Curate popovers share the mobile bottom-sheet pattern', () => {
  const sheetPattern = /fixed inset-x-4 bottom-4 z-50 max-h-\[75vh\] overflow-y-auto rounded-lg border border-border bg-surface-overlay p-3 shadow-xl space-y-2 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:mt-1/g
  const matches = [...workspace.matchAll(sheetPattern)]
  assert.equal(matches.length, 4,
    `expected 4 Curate popovers (Diverse, Balanced, Similar, Find by text) on the bottom-sheet pattern, found ${matches.length}`)
})

test('🎨 Pick diverse and 🎯 Similar to selected specifically carry the fix', () => {
  const diverseStart = workspace.indexOf("curateOpen === 'diverse'")
  const diverseBlock = workspace.slice(diverseStart, workspace.indexOf('</div>', diverseStart) + 200)
  assert.match(diverseBlock, /sm:w-72/, 'Diverse must keep its own w-72 desktop width, not adopt w-80')

  const similarStart = workspace.indexOf("curateOpen === 'similar'")
  const similarBlock = workspace.slice(similarStart, workspace.indexOf('</div>', similarStart) + 200)
  assert.match(similarBlock, /sm:w-72/, 'Similar must keep its own w-72 desktop width, not adopt w-80')
})
