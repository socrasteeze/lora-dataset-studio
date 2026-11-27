/* global test -- Vitest exposes test with --globals. */
import assert from 'node:assert/strict'
import { hasNewFrontendBuild } from '../src/utils/frontendBuild.js'

const currentEntry = '/assets/index-old_12.js'

test('detects a different production module in the fetched HTML', () => {
  const html = `<link rel="modulepreload" href="${currentEntry}">
    <script type="module" crossorigin src="/assets/index-new-34.js"></script>`
  assert.equal(hasNewFrontendBuild(html, currentEntry), true)
})

test('keeps the current build when the module path matches', () => {
  const html = `<script type="module" src="${currentEntry}"></script>`
  assert.equal(hasNewFrontendBuild(html, currentEntry), false)
})

test('detects the module when src comes before type', () => {
  const html = "<script src='/assets/index-new.js' type='module'></script>"
  assert.equal(hasNewFrontendBuild(html, currentEntry), true)
})

test('keeps the current page when either production module path is missing', () => {
  const html = '<script type="module" src="/assets/index-new.js"></script>'
  assert.equal(hasNewFrontendBuild(html, undefined), false)
  assert.equal(hasNewFrontendBuild(html, '/src/main.jsx'), false)
  assert.equal(hasNewFrontendBuild('<script src="/assets/index-other.js"></script>', currentEntry), false)
  assert.equal(hasNewFrontendBuild('<script data-type="module" src="/assets/index-other.js"></script>', currentEntry), false)
  assert.equal(hasNewFrontendBuild('<script type="module" src="/src/main.jsx"></script>', currentEntry), false)
})
