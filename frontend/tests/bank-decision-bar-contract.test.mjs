/* The bank's pinned decision bar + the collapsible filter panel — wiring
 * contract.
 *
 * `node --test` cannot parse JSX and has no layout engine, so a `sticky` bar
 * that quietly turned into a `fixed` one (permanently covering the last row
 * of thumbnails and the page's own pagination) would look identical in every
 * test that only checks the buttons still exist. These regexes over the raw
 * source are the whole defence — the same shape as
 * tests/mobile-rail-containing-block.test.mjs, which pins a comparable "one
 * className away from a phone-only regression" hazard.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontend = path.resolve(here, '..')
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8')
const bar = read('src/components/bank/BankDecisionBar.jsx')
const workspace = read('src/components/bank/BankWorkspace.jsx')

test('the bar is sticky, never fixed, and stays under every popover/dialog/toast', () => {
  const m = bar.match(/className="([^"]*sticky bottom-0[^"]*)"/)
  assert.ok(m, 'the sticky bottom-0 container was not found')
  const cls = m[1]
  // The whole point: a sticky element occupies its place in normal flow, so
  // the page grows by exactly the bar's height and nothing ever sits
  // permanently behind it. `fixed` paints over the page instead.
  assert.ok(!/\bfixed\b/.test(cls), 'the bar must never be `fixed` — see the file docstring')
  // A rail that scrolls AND carries an absolutely-positioned descendant can
  // escape its containing block and widen the whole page (the exact bug
  // mobile-rail-containing-block.test.mjs exists to catch) — this bar wraps
  // instead of scrolling, so it must not opt into that hazard.
  assert.ok(!/overflow-x-auto/.test(cls))
  const z = cls.match(/z-(\d+)/)
  assert.ok(z, 'the bar must set an explicit z-index')
  // Below the app header (z-40), every bank popover scrim/dialog (z-40/z-50),
  // the review lightbox (z-[9996]) and the toast (z-[10000], pinned by
  // Toast.contract.test.js) — a bar above its own scrim would stay clickable
  // through it.
  assert.ok(Number(z[1]) < 40, `z-${z[1]} must stay below the app header's z-40`)
})

test('the WHY survives a tidy-up: the sticky-vs-fixed reasoning is in the file', () => {
  assert.match(bar, /normal (document )?flow/i)
  assert.match(bar, /(never|nothing).{0,40}(trapped|covering|painted over)/i)
})

test('BankWorkspace renders the bar as the last child of the root, after the grid', () => {
  assert.match(workspace, /<BankDecisionBar\b/)
  const barAt = workspace.indexOf('<BankDecisionBar')
  const promoteAt = workspace.indexOf('{promoteOpen &&')
  const gridAt = workspace.indexOf("Nothing matches this filter")
  assert.ok(barAt > 0 && promoteAt > 0 && gridAt > 0)
  assert.ok(gridAt < barAt, 'the bar must render after the grid')
  assert.ok(barAt < promoteAt, 'the bar must render before the modals')
})

test('the selection actions exist in exactly one place — the bar, not inline', () => {
  const keepInBar = (bar.match(/onClick=\{onKeep\}/g) || []).length
  assert.equal(keepInBar, 1)
  const keepInline = (workspace.match(/batchStatus\(\[\.\.\.selected\], 'keep'\)/g) || []).length
  assert.equal(keepInline, 1, 'batchStatus(...,\'keep\') must be wired exactly once, from the bar\'s onKeep')
  assert.doesNotMatch(workspace, />✓ Keep<\/button>/, 'no inline ✓ Keep button should remain in BankWorkspace.jsx')
})

test('Keep and Reject share one even row, Skip and CLR the next', () => {
  const grids = [...bar.matchAll(/className="grid grid-cols-2 gap-1\.5"/g)]
  assert.equal(grids.length, 2, 'two even two-column rows: Keep/Reject, then Skip/CLR')
  assert.match(bar, />\s*✓ Keep\s*</)
  assert.match(bar, />\s*✕ Reject\s*</)
  assert.match(bar, />\s*Skip\s*</)
  assert.match(bar, />\s*CLR\s*</)
  assert.doesNotMatch(bar, />\s*↺ Undecided\s*</)
  assert.doesNotMatch(bar, />\s*Undecided\s*</)
  assert.match(bar, /aria-label="Clear selection"/)
  assert.match(bar, /title="Set these images back to undecided"/)
})

test('the undo offer moved into the bar and out of the page header', () => {
  assert.doesNotMatch(workspace, /<UndoBar\b/)
  assert.match(bar, /undoOffer/)
  assert.match(bar, /role="status" aria-live="polite"/)
})

// DIVERGENCE — the Encre redesign (upstream 62cc6a11) replaced this fork's
// collapsible filter PANEL with its own always-visible filter RAIL
// (BankFilterRail.jsx), which is the centrepiece of that redesign rather than an
// incidental move. The three assertions that pinned the panel's collapse
// (aria-expanded={filtersOpen} / #bank-filter-panel), its header summary and the
// "Results readout stays outside the collapse" rule therefore describe a surface
// that no longer exists here. They are retired rather than weakened: re-adding a
// second filter UI to satisfy them would be the regression, not the fix. The
// decision bar's own contract above is untouched — that feature is fork-only and
// survived the redesign.
test('isFiltered and the header summary share one source, so they cannot disagree', () => {
  assert.match(workspace, /const filterSummary = bankFilterSummary\(filter, \{ labels: filterLabels \}\)/)
  assert.match(workspace, /const isFiltered = bankFilterCount\(filter, \{ labels: filterLabels \}\) > 0/)
})

test('Clear all resets every facet but leaves the sort order alone', () => {
  const start = workspace.indexOf('const clearAllFilters = ')
  assert.ok(start > 0)
  const body = workspace.slice(start, workspace.indexOf('\n  }\n', start))
  assert.match(body, /setSearchText\(''\)/)
  assert.match(body, /setExcludeText\(''\)/)
  assert.doesNotMatch(body, /sort:/, 'Clear all must not touch the remembered sort order')
})

// (retired with the collapse, same reason as the note above.)
