import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, renderToStaticMarkup } from '../../../tests/support/mountJsx.mjs'

const { MemoryRouter } = await import('react-router')
const { default: InstalledPlugins } = await import('./InstalledPlugins.jsx')

test('the installed list names the plugin and its on-off control', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(InstalledPlugins, {
    plugins: [{ id: 'video', name: 'Video', version: '1.2.0', enabled: true, active: true, state: 'loaded', bundled: true, description: 'Clips' }],
    caps: {},
    capsKnown: true,
    onToggle: () => {},
    onRemove: () => {},
    onInstalled: () => {},
  })))
  assert.match(html, /plugin-row-video/)
  assert.match(html, /Video/)
  assert.match(html, /Turn off/)
  assert.match(html, /Settings for Video/)
})

test('a locked browser shows the plugin admin token panel', async () => {
  const { PluginAdminLock } = await import('../PluginsPage.jsx')
  const html = renderToStaticMarkup(createElement(PluginAdminLock, {
    value: '', onChange: () => {}, onUnlock: () => {}, checking: false, rejected: false,
  }))
  assert.match(html, /id="plugin-administration"/)
  assert.match(html, /plugin-admin-token/)
  assert.match(html, /Unlock plugin changes/)
})

test('an empty install says no plugin is installed', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(InstalledPlugins, { plugins: [] })))
  assert.match(html, /No plugin installed yet/)
})

const activePlugin = {
  id: 'video', name: 'Video', version: '1.2.0', enabled: true, active: true, state: 'loaded', bundled: true,
}

function renderWithProblems(loadProblems) {
  const previous = globalThis.window
  globalThis.window = { ...(previous || {}), lds: { ...(previous?.lds || {}), loadProblems } }
  try {
    return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(InstalledPlugins, {
      plugins: [activePlugin],
      caps: {},
      capsKnown: true,
      onToggle: () => {},
      onRemove: () => {},
      onInstalled: () => {},
    })))
  } finally {
    if (previous) globalThis.window = previous
    else delete globalThis.window
  }
}

for (const [kind, reason] of [
  ['script', 'The plugin UI failed to load.'],
  ['stylesheet', 'Stylesheet failed to load'],
  ['descriptor', 'The plugin UI did not register its descriptor.'],
]) {
  test(`a ${kind} load failure is shown with a reload and is not a healthy Active now`, () => {
    const html = renderWithProblems([{ plugin: 'video', reason }])
    assert.match(html, new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(html, /Reload Page/)
    assert.doesNotMatch(html, /Active now/)
  })
}

test('a backend-active plugin with no load problem still says Active now', () => {
  const html = renderWithProblems([])
  assert.match(html, /Active now/)
  assert.doesNotMatch(html, /Reload Page/)
  assert.doesNotMatch(html, /Interface did not load/)
})

test('plugin settings still explain a load failure and offer reload', () => {
  const src = readFileSync(new URL('../PluginSettingsPage.jsx', import.meta.url), 'utf8')
  assert.match(src, /This plugin’s interface did not load\. Reload the page, or repair the plugin from Plugins\./)
  assert.match(src, />Reload Page</)
  assert.match(src, /window\.location\.reload\(\)/)
})
