import test from 'node:test'
import assert from 'node:assert/strict'
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
