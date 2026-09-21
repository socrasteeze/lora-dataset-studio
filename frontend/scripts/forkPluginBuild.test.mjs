import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import configure from '../vite.config.js'
import { resolvePluginBuildMode } from './privatePluginBuild.mjs'

test('fork build selects curated descriptors before ordinary module resolution', () => {
  const previous = process.env.LDS_PLUGIN_BUILD_MODE
  process.env.LDS_PLUGIN_BUILD_MODE = 'fork'
  try {
    const config = configure({ mode: 'test' })
    const plugin = config.plugins.find(value => value.name === 'lds-plugin-build-mode')
    assert.equal(plugin.enforce, 'pre')
    const entry = plugin.resolveId('./plugins/bundled', '/fixture/frontend/src/main.jsx')
    const source = plugin.load(entry)
    const policy = JSON.parse(readFileSync(new URL('../../fork-plugins.json', import.meta.url), 'utf8'))
    const imported = [...source.matchAll(/@bundled\/([^/]+)\/frontend\/index\.js/g)].map(match => match[1])
    assert.deepEqual(imported, policy.enabled)
    for (const id of [...policy.held, ...policy.excluded]) assert.ok(!source.includes(`@bundled/${id}/`))
    const assets = []
    plugin.generateBundle.call({ emitFile: asset => assets.push(asset) })
    const marker = JSON.parse(assets.find(asset => asset.fileName === 'plugin-build.json').source)
    assert.equal(marker.distribution, 'fork')
    assert.deepEqual(marker.plugins, imported)
  } finally {
    if (previous === undefined) delete process.env.LDS_PLUGIN_BUILD_MODE
    else process.env.LDS_PLUGIN_BUILD_MODE = previous
  }
})

test('fork distribution is the default and preserves explicit Store and development profiles', () => {
  assert.equal(resolvePluginBuildMode({}, {}), 'fork')
  assert.equal(resolvePluginBuildMode({}, { LDS_PLUGIN_BUILD_MODE: 'store' }), 'store')
  assert.equal(resolvePluginBuildMode({}, { LDS_PLUGIN_BUILD_MODE: 'bundled' }), 'bundled')
  assert.equal(resolvePluginBuildMode({}, { LDS_PLUGIN_BUILD_MODE: 'fork' }), 'fork')
})
