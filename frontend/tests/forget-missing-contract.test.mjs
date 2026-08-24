/* 🧹 Forget missing — the wiring, both places it is offered.
 *
 * The logic (preview, confirm, the fresh walk) lives in ForgetMissingDialog.jsx
 * and image_bank_service.forget_missing/_preview. What a rewrite loses silently
 * is that the dialog is actually WIRED at both entry points — the workspace's
 * FolderSyncNote and the bank list card — and that opening it does not silently
 * fall back to the old single-step confirm() flow.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const dialog = read('../src/components/bank/ForgetMissingDialog.jsx')
const workspace = read('../src/components/bank/BankWorkspace.jsx')
const page = read('../src/pages/BankPage.jsx')

test('the dialog previews before it applies, and confirms with the server', () => {
  assert.match(dialog, /postJson\(`\/api\/bank\/\$\{bankId\}\/forget-missing`, \{\}\)/,
    'opening the dialog must ask for a fresh preview, not trust the stale banner count')
  assert.match(dialog, /postJson\(`\/api\/bank\/\$\{bankId\}\/forget-missing`, \{ confirm: true \}\)/)
})

test('it is offered from the workspace AND from the bank card, both opening the dialog', () => {
  assert.match(workspace, /onForget=\{\(\) => setForgettingMissing\(true\)\}/)
  assert.match(workspace, /<ForgetMissingDialog\b/)
  assert.match(page, /onForget=\{\(\) => setForgetting\(b\)\}/)
  assert.match(page, /<ForgetMissingDialog\b/)
})

test('neither call site still carries the old single-step window.confirm flow', () => {
  for (const [name, src] of [['workspace', workspace], ['bank list', page]]) {
    assert.ok(!src.includes('window.confirm(forgetMissingConfirm'),
      `${name} must not fall back to the retired single-step confirm`)
  }
})

test('the toast repeats that no file was touched', () => {
  assert.match(dialog, /Nothing on disk is touched/)
})
