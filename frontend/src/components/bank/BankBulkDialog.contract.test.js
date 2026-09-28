import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const edit = fs.readFileSync(new URL('./BankBulkDialog.jsx', import.meta.url), 'utf8')
const remove = fs.readFileSync(new URL('./BankBulkDeleteDialog.jsx', import.meta.url), 'utf8')

test('bulk edit renders per-bank names, literal tools, grouping, and probe markers', () => {
  assert.match(edit, /data-probe-layer/)
  assert.match(edit, /data-probe-chrome="bank-bulk-dialog"/)
  assert.match(edit, />Name Tools</)
  assert.match(edit, /Find uses literal text/)
  assert.match(edit, />Group by Name</)
  assert.match(edit, /aria-label=\{`Name for \$\{bank\.name\}`\}/)
  assert.match(edit, /Save Changes/)
})

test('bulk delete names selected banks and states both storage outcomes', () => {
  assert.match(remove, /Delete \{pending\.length\} Bank\(s\)\?/)
  assert.match(remove, /bank\.source_path/)
  assert.match(edit, /bank\.source_path/)
  assert.match(remove, /External source files stay/)
  assert.match(remove, /App-managed imported copies go to Trash/)
  assert.match(remove, /Trash does not restore that data/)
  assert.match(remove, /'Delete Banks'/)
})

test('bulk requests carry stable instances and retries retain exact payloads', () => {
  assert.match(edit, /postJson\('\/api\/banks\/bulk-edit', exactPayload\)/)
  assert.match(edit, /setSubmittedPayload\(exactPayload\)/)
  assert.match(remove, /postJson\('\/api\/banks\/bulk-delete', payload\)/)
  assert.match(remove, /instance_id: String\(bank\.instance_id\)/)
})
