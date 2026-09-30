import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
const rail = read('BankFilterRail.jsx')
const workspace = read('BankWorkspace.jsx')

/* The upstream Encre merge (f7543f826) dropped the old filter panel's header
   and its ✕ Why row without a sound: bankFilterSummary.js, clearAllFilters and
   the reject-reason counts all survived in the workspace, wired to nothing.
   Each test pins both ends of one wire, so the next merge that drops either
   side fails here instead of in a user's hands. */

test('the rail heads itself with what is filtering, in words', () => {
  assert.match(rail, /\{filterSummary\.text\}/)
  assert.match(rail, /title=\{filterSummary\.title\}/)
  assert.ok(workspace.includes('filterSummary={filterSummary}'),
    'BankWorkspace passes filterSummary to the rail')
})

test('the rail offers one click back to the whole bank', () => {
  assert.match(rail, /onClick=\{clearAllFilters\}/)
  assert.match(rail, /✕ Clear all/)
  // One-line fixed height, like every other small button in the rail.
  assert.match(rail, /lg:h-7 shrink-0 whitespace-nowrap[^"]*">\s*✕ Clear all/)
  assert.ok(workspace.includes('clearAllFilters={clearAllFilters}'),
    'BankWorkspace passes clearAllFilters to the rail')
})

test('the closed drawer button still says how many filters are on', () => {
  assert.match(workspace, /☰ Filters\{filterSummary\.count > 0 && \(/)
  assert.match(workspace, /title=\{filterSummary\.count \? filterSummary\.title : undefined\}/)
})

test('the rail renders the ✕ Why reject-reason chips', () => {
  assert.match(rail, /label="✕ Why"/)
  assert.match(rail, /\(filter\.status === 'reject' \|\| filter\.reason\) && shownReasons\.length > 0/)
  assert.match(rail, /setF\(\{ reason: filter\.reason === b\.id \? null : b\.id \}\)/)
  assert.match(rail, /reasonHint\(b\.id, FLAG_HINT\)/)
  assert.match(rail, /reasonCounts\[b\.id\] \?\? 0/)
  for (const prop of ['shownReasons={shownReasons}', 'reasonCounts={reasonCounts}',
    'reasonHint={reasonHint}']) {
    assert.ok(workspace.includes(prop), `BankWorkspace passes ${prop}`)
  }
})

/* The same merge left three more leftovers that WERE superseded, and were
   removed rather than restored. Pin the replacements, so the reasoning that
   justified the removal cannot quietly stop being true. */
test('the superseded controls live on in their new homes', () => {
  // The pass-device picker moved into the passes panel.
  assert.match(read('BankPassesPanel.jsx'), /<DevicePicker value=\{passDevice\}[^>]*kind="bank-pass"/)
  // The ↩ Undo banner moved into the pinned decision bar.
  assert.match(read('BankDecisionBar.jsx'), /onClick=\{onUndo\}/)
  assert.ok(workspace.includes('undoOffer={undoBar}'), 'BankWorkspace hands the undo offer to the bar')
  // The folding filter panel became the rail's own open/close.
  assert.match(workspace, /aria-controls="bank-filter-rail"/)
})
