import assert from 'node:assert/strict'
import test from 'node:test'

import { createElement, renderToStaticMarkup } from './support/mountJsx.mjs'

const { default: Pagination } = await import('../src/components/common/Pagination.jsx')
const { MemoryRouter } = await import('react-router')
const { default: DatasetListPanel } = await import('../src/components/dataset/DatasetListPanel.jsx')

const html = (node) => renderToStaticMarkup(node)
const panel = (props) => html(createElement(MemoryRouter, null, createElement(DatasetListPanel, props)))

test('the pager says the page, the range, and the three page sizes', () => {
  const markup = html(createElement(Pagination, {
    page: 2, pages: 4, pageSize: 24, total: 80, rangeStart: 25, rangeEnd: 48,
    onPage: () => {}, onPageSize: () => {}, label: 'Datasets per page',
  }))
  assert.match(markup, /page 2 of 4/)
  assert.match(markup, /25–48 of 80/)
  assert.match(markup, /Previous/)
  assert.match(markup, /Next/)
  assert.match(markup, /aria-label="Datasets per page"/)
  assert.match(markup, /<option[^>]*>24<\/option>/)
  assert.match(markup, /<option[^>]*>48<\/option>/)
  assert.match(markup, /<option[^>]*>96<\/option>/)
  assert.doesNotMatch(markup, /data-probe-chrome/)
})

test('previous is off on the first page and next is off on the last', () => {
  const first = html(createElement(Pagination, {
    page: 1, pages: 3, pageSize: 24, total: 50, rangeStart: 1, rangeEnd: 24,
    onPage: () => {}, onPageSize: () => {},
  }))
  assert.match(first, /<button[^>]*disabled[^>]*>Previous/)
  const last = html(createElement(Pagination, {
    page: 3, pages: 3, pageSize: 24, total: 50, rangeStart: 49, rangeEnd: 50,
    onPage: () => {}, onPageSize: () => {},
  }))
  assert.match(last, /<button[^>]*disabled[^>]*>Next/)
})

test('the dataset library renders one page of tiles and keeps the opener label', () => {
  const datasets = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    name: `Set ${i + 1}`,
    kind: 'character',
    images_kept: 1,
    images_total: 1,
    trained_families: i < 10 ? ['zimage'] : [],
  }))
  const markup = panel({
    datasets, listStatus: 'ready', onOpen: () => {}, onCreate: () => {},
  })
  const openers = markup.match(/aria-label="Open the dataset /g) || []
  assert.equal(openers.length, 24)
  assert.match(markup, /page 1 of 2/)
  assert.match(markup, /1–24 of 30/)
  assert.match(markup, /xl:grid-cols-5|grid-cols-2/)
})
