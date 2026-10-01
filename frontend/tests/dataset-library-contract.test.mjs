import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontend = path.resolve(here, '..')
const panel = fs.readFileSync(path.join(frontend, 'src/components/dataset/DatasetListPanel.jsx'), 'utf8')
const grid = fs.readFileSync(path.join(frontend, 'src/components/dataset/DatasetGrid.jsx'), 'utf8')
const css = fs.readFileSync(path.join(frontend, 'src/index.css'), 'utf8')
const page = fs.readFileSync(path.join(frontend, 'src/pages/DatasetPage.jsx'), 'utf8')

test('library page persists its display preferences under stable keys', () => {
  assert.match(panel, /datasetLibraryTileSize/)
  assert.match(panel, /datasetLibraryCollapsed_v1/)
  // Both go through the storage-hardened normalizers, never raw JSON.parse.
  assert.match(panel, /normalizeTileSize\(localStorage\.getItem/)
  assert.match(panel, /normalizeCollapsedMap\(localStorage\.getItem/)
})

test('library filtering/grouping goes through the tested pure helpers', () => {
  assert.match(panel, /from '\.\.\/\.\.\/utils\/datasetLibrary'/)
  assert.match(panel, /datasetMatches\(d, query, kindFilter\)/)
  assert.match(panel, /groupDatasets\(paged\.items\)/)
})

test('family sections are collapsible and announce their state', () => {
  assert.match(panel, /aria-expanded=\{open\}/)
  // A fold must never hide search/filter matches — sections force open.
  assert.match(panel, /filterActive \|\| !collapsed\[family\]/)
  assert.match(panel, /disabled=\{filterActive\}/)
})

test('the S/M/L control is the shared segmented component, in both grids', () => {
  assert.match(panel, /import TileSizeControl from '\.\.\/shared\/TileSizeControl'/)
  assert.match(grid, /import TileSizeControl from '\.\.\/shared\/TileSizeControl'/)
  // The library keeps the workspace grid's key untouched (separate prefs).
  assert.match(grid, /datasetGridTileSize/)
})

test('S, M and L are tile grids, and a page is grouped after it is sliced', () => {
  assert.match(panel, /S: 'grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'/)
  assert.match(panel, /M: 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4'/)
  assert.match(panel, /L: 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3'/)
  assert.match(panel, /<DatasetTile /)
  assert.doesNotMatch(panel, /function DatasetRow/)
  assert.match(panel, /groupDatasets\(paged\.items\)/)
  assert.match(panel, /libraryPageFor\(/)
})

test('desktop-first: the library uses the full page width and 5/4/3 columns at xl', () => {
  // The old max-w-4xl cap must not come back around the list panel (the
  // empty-state hero and creation form re-cap themselves inside the panel).
  assert.doesNotMatch(page, /max-w-4xl/)
  assert.match(panel, /xl:grid-cols-5/)
  assert.match(panel, /xl:grid-cols-4/)
  assert.match(panel, /xl:grid-cols-3/)
})

test('library cards follow the fine-pointer hover-action contract', () => {
  assert.match(css, /\.library-card:hover \.library-card__actions/)
  assert.match(css, /\.library-card:focus-within \.library-card__actions/)
  // Hidden without reflow (visibility, not display) and touch keeps controls.
  assert.match(css, /\.library-card \.library-card__actions\s*\{[^}]*visibility: hidden/s)
  assert.doesNotMatch(css, /\.library-card \.library-card__actions\s*\{[^}]*display:\s*none/s)
  // Applied on the photo tile: the export bar and the corner actions.
  assert.ok((panel.match(/library-card__actions/g) || []).length >= 2)
  assert.ok((panel.match(/className="library-card /g) || []).length >= 1)
})
