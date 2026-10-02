/* The bank page calls composeBankList. These cases drive that function, then
 * the promote dialog that quotes the row it returns. */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement, renderToStaticMarkup } from './support/mountJsx.mjs'

const { composeBankList } = await import('../src/components/bank/bankListCompose.js')
const { default: BankGroupPromoteDialog } = await import('../src/components/bank/BankGroupPromoteDialog.jsx')
const { ToastProvider } = await import('../src/components/common/Toast.jsx')

const bank = (id, keep = 3) => ({
  id,
  name: 'Same',
  instance_id: `inst-${id}`,
  total: 4,
  scanned: 4,
  keep,
  reject: 1,
})

test('25 same-name banks at page size 24 stay one complete group', () => {
  const banks = Array.from({ length: 25 }, (_, i) => bank(i + 1))
  const browse = composeBankList(banks, { selecting: false, page: 1, pageSize: 24 })
  assert.equal(browse.rows.length, 1)
  assert.equal(browse.rows[0].kind, 'group')
  assert.equal(browse.rows[0].members.length, 25)
  assert.equal(browse.rows[0].keep, 75)
  assert.equal(browse.paged.total, 1)

  const html = renderToStaticMarkup(createElement(ToastProvider, null,
    createElement(BankGroupPromoteDialog, {
      row: browse.rows[0],
      onClose: () => {},
      onStarted: () => {},
    })))
  assert.match(html, /25 banks/)
  assert.match(html, /75 kept/)
})

test('selection mode pages raw banks and does not build a group card', () => {
  const banks = Array.from({ length: 25 }, (_, i) => bank(i + 1))
  const page = composeBankList(banks, { selecting: true, page: 1, pageSize: 24 })
  assert.equal(page.rows.length, 24)
  assert.equal(page.paged.total, 25)
  assert.equal(page.paged.pages, 2)
  assert.ok(page.rows.every((row) => row.kind === 'bank'))
  const rest = composeBankList(banks, { selecting: true, page: 2, pageSize: 24 })
  assert.equal(rest.rows.length, 1)
  assert.equal(rest.rows[0].kind, 'bank')
  assert.equal(rest.rows[0].bank.id, 25)
})

test('a filtered singleton is not a group', () => {
  const page = composeBankList([bank(4)], { selecting: false, page: 1, pageSize: 24 })
  assert.equal(page.rows.length, 1)
  assert.equal(page.rows[0].kind, 'bank')
  assert.equal(page.rows[0].bank.id, 4)
})
