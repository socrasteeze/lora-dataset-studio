import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTER_PANEL_WIDE_PX, FILTERS_OPEN_KEY, initialFiltersOpen, loadFiltersOpen, saveFiltersOpen,
} from './bankFilterPanelOpen.js'

test('the storage key is a permanent handle', () => {
  assert.equal(FILTERS_OPEN_KEY, 'bankFiltersOpen')
})

test('a stored answer always wins, on any screen size', () => {
  assert.equal(initialFiltersOpen({ stored: true, viewportWidth: 320 }), true)
  assert.equal(initialFiltersOpen({ stored: false, viewportWidth: 1920 }), false)
})

test('no stored answer: open at/above the width, folded below it', () => {
  assert.equal(initialFiltersOpen({ stored: null, viewportWidth: FILTER_PANEL_WIDE_PX }), true)
  assert.equal(initialFiltersOpen({ stored: null, viewportWidth: FILTER_PANEL_WIDE_PX - 1 }), false)
  assert.equal(initialFiltersOpen({ stored: null, viewportWidth: 1440 }), true)
  assert.equal(initialFiltersOpen({ stored: null, viewportWidth: 390 }), false)
})

test('an unmeasurable viewport defaults open rather than guessing folded', () => {
  assert.equal(initialFiltersOpen({ stored: null, viewportWidth: undefined }), true)
  assert.equal(initialFiltersOpen({ stored: null, viewportWidth: 0 }), true)
  assert.equal(initialFiltersOpen({ stored: null, viewportWidth: NaN }), true)
  assert.equal(initialFiltersOpen({ stored: null }), true)
})

test('save/load round-trip through a fake localStorage', () => {
  const data = {}
  const fake = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
  }
  const realLS = globalThis.localStorage
  globalThis.localStorage = fake
  try {
    assert.equal(loadFiltersOpen(), null)
    saveFiltersOpen(true)
    assert.equal(loadFiltersOpen(), true)
    saveFiltersOpen(false)
    assert.equal(loadFiltersOpen(), false)
  } finally {
    globalThis.localStorage = realLS
  }
})

test('a private-mode throw on access degrades to null / no crash', () => {
  const realLS = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError') },
  })
  try {
    assert.equal(loadFiltersOpen(), null)
    assert.doesNotThrow(() => saveFiltersOpen(true))
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, writable: true, value: realLS,
    })
  }
})
