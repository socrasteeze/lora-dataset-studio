/**
 * Contract test for the id-list guard behind ▶ Review and "Select all in filter".
 *
 * node --test cannot parse JSX, so the DECISION lives in
 * src/components/bank/bankIds.js (unit-tested there) and this file greps the JSX
 * for the wiring. What it protects against is a one-token regression: `d.ids ||
 * []` reads a stale backend's answer — which has no `ids` key, because it
 * predates `ids_only` — as "your filter matches nothing", and the UI then says
 * so over a grid showing 1,128 images. Nothing throws, nothing logs, and the
 * user is sent to inspect filters that were never the problem.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const BANK = read('../src/components/bank/BankWorkspace.jsx')

test('fetchAllIds reads the response through the guard, not inline', () => {
  assert.match(BANK, /import \{ idsFromResponse \} from '\.\/bankIds\.js'/,
    'the guard must be imported from bankIds.js')
  assert.match(BANK, /return idsFromResponse\(d\)/,
    'fetchAllIds must return through idsFromResponse, so a missing id list is '
    + 'refused rather than read as an empty filter')
})

test('the "or empty array" shortcut never comes back', () => {
  // The exact regression. Any spelling of "treat a missing list as empty" here
  // re-creates the bug, silently, on the next person who tidies this function.
  assert.doesNotMatch(BANK, /\bd\.ids\s*\|\|/,
    'd.ids || [] conflates "no answer" with "empty answer" — use idsFromResponse')
  assert.doesNotMatch(BANK, /\bids:\s*d\.ids\s*\?\?/,
    'a ?? fallback has the same effect as || here')
})

test('both callers surface the thrown message instead of swallowing it', () => {
  // The guard is only worth anything if its message reaches the user. Both
  // call sites catch and must prefer the error's own text over a generic one.
  assert.match(BANK, /toast\.error\(e\?\.message \|\| 'Could not build the review list\.'\)/,
    '▶ Review must show the thrown reason when there is one')
  assert.match(BANK, /toast\.error\(e\?\.message \|\| 'Selection failed\.'\)/,
    '"Select all in filter" must show the thrown reason when there is one')
})
