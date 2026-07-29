/* "Accept — remove N from this bank" — the wiring, both places it is offered.
 *
 * The logic (when to offer it, what the confirm says) is unit-tested in
 * bankSync.test.js. What a rewrite loses silently is that the button is wired at
 * all, that it CONFIRMS, and that it refreshes afterwards — a count that stays
 * on screen after being accepted reads as a button that did nothing, which is
 * the bug this feature exists to end.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const note = read('../src/components/bank/FolderSyncNote.jsx')
const workspace = read('../src/components/bank/BankWorkspace.jsx')
const page = read('../src/pages/BankPage.jsx')

test('the note renders the accept only when the helper allows it', () => {
  // note.canForget is false for an unavailable folder — an unplugged drive makes
  // every row look missing, and accepting there wipes the triage.
  assert.match(note, /\{note\.canForget && onForget && \(/)
  assert.match(note, /Accept — remove \{note\.missing\} from this bank/)
})

test('it is offered from the workspace AND from the bank card', () => {
  assert.match(workspace, /onForget=\{forgetMissing\}/)
  assert.match(page, /onForget=\{\(missing\) => forgetMissing\(b, missing\)\}/)
})

test('both call sites confirm before posting', () => {
  for (const [name, src] of [['workspace', workspace], ['bank list', page]]) {
    assert.ok(src.includes('window.confirm(forgetMissingConfirm(missing))'),
      `${name} must confirm — the rows carry decisions that are lost with them`)
    assert.ok(src.includes('/forget-missing'), `${name} must post the route`)
  }
})

test('the count is refreshed afterwards, so the flag visibly clears', () => {
  assert.match(workspace, /refreshPayload\(\{ force: true \}\)/)
  assert.match(page, /forgetMissing = async \(bank, missing\) => \{[\s\S]*?await refresh\(\)/)
})

test('the toast repeats that no file was touched', () => {
  // The one thing a user is afraid of when a button says "remove".
  assert.match(workspace, /no file was touched/)
  assert.match(page, /no file was touched/)
})
