import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../../pages/BankPage.jsx', import.meta.url), 'utf8')
const check = readFileSync(new URL('./FolderCheckLine.jsx', import.meta.url), 'utf8')

test('the bank list hides the title and lane switch behind a flag, without removing them', () => {
  assert.match(page, /const SHOW_BANK_PAGE_CHROME = false/)
  assert.match(page, /SHOW_BANK_PAGE_CHROME && \(/)
  assert.match(page, /> Image bank</)
  assert.match(page, /<BankLaneTabs /)
  assert.match(page, /import BankLaneTabs from/)
})

test('create-row Name and Folder labels are gone, with aria-labels kept', () => {
  assert.doesNotMatch(page, /htmlFor="bank-name"/)
  assert.doesNotMatch(page, /label="Folder"/)
  assert.match(page, /aria-label="Name"/)
  assert.match(page, /'aria-label': 'Folder'/)
})

test('stale folder counts color Rescan Folders and do not print a notice', () => {
  assert.doesNotMatch(check, /Counts May Be Stale/)
  assert.doesNotMatch(check, /noticeClassName/)
  assert.match(check, /note\.stale/)
  assert.match(check, /border-amber-400\/60/)
  assert.match(check, /title=\{note\.text\}/)
})
