import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  FOLD_KEYS, loadDismissedReport, loadFold, saveDismissedReport, saveFold,
} from './bankLayout.js'

const memStore = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
const throwing = { getItem() { throw new Error('private mode') }, setItem() { throw new Error('quota') } }

test('a fold remembers open and closed, and falls back when nothing valid is stored', () => {
  const s = memStore()
  assert.equal(loadFold(FOLD_KEYS.curate, false, s), false)
  assert.equal(saveFold(FOLD_KEYS.curate, true, s), true)
  assert.equal(loadFold(FOLD_KEYS.curate, false, s), true)
  saveFold(FOLD_KEYS.more, false, s)
  assert.equal(loadFold(FOLD_KEYS.more, true, s), false)
  s.setItem(FOLD_KEYS.more, 'garbage')
  assert.equal(loadFold(FOLD_KEYS.more, true, s), true)
  assert.equal(loadFold(FOLD_KEYS.more, true, throwing), true, 'a broken store never throws')
  assert.equal(saveFold(FOLD_KEYS.more, false, throwing), false)
})

test('a dismissed Launch-all report stays dismissed per bank until a new run', () => {
  const s = memStore()
  assert.equal(loadDismissedReport(7, s), null)
  assert.equal(saveDismissedReport(7, 1790670091.9, s), 1790670091.9)
  assert.equal(loadDismissedReport(7, s), 1790670091.9)
  assert.equal(loadDismissedReport(8, s), null, 'another bank is unaffected')
  assert.equal(loadDismissedReport(7, throwing), null)
})

test('the workspace reads the remembered folds and the dismissal', () => {
  const ws = readFileSync(new URL('./BankWorkspace.jsx', import.meta.url), 'utf8')
  assert.match(ws, /useState\(\(\) => loadDismissedReport\(bankId\)\)/)
  assert.match(ws, /saveDismissedReport\(bankId, payload\.pipeline_report\.finished_at\)/)
  assert.match(ws, /loadFold\(FOLD_KEYS\.more, true\)/)
  assert.match(ws, /loadFold\(FOLD_KEYS\.curate, false\)/)
  assert.match(ws, /aria-controls="bank-curate"/)
})

test('Pick a balanced set unfolds Curate, where the Balanced pick popover lives', () => {
  // The Coverage panel stays up when Curate is folded; opening only the popover
  // left the button doing nothing visible.
  const ws = readFileSync(new URL('./BankWorkspace.jsx', import.meta.url), 'utf8')
  const panel = ws.slice(ws.indexOf('<CoveragePanel'))
  assert.match(panel,
    /onBalance=\{balanceReady\.ready \? \(\) => \{\s*setCurateShownState\(saveFold\(FOLD_KEYS\.curate, true\)\)\s*setCurateOpen\('balanced'\)/)
})
