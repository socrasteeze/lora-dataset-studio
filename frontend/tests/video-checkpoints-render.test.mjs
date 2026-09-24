/**
 * 📦 The Checkpoints & LoRAs section of a video dataset, RENDERED from a
 * payload — the states a maintainer would otherwise only see with a trained
 * set behind the page. `renderToStaticMarkup` runs no effect, so the list is
 * fed directly; what is pinned is that the markup carries what the model
 * decided: a verb as a real <button>, a refusal as its sentence, one ⬇ per
 * file, and never "Final (step null)".
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, renderToStaticMarkup } from './support/mountJsx.mjs'

const { VideoCheckpointList } = await import("../../bundled/video/frontend/videobank/VideoCheckpointManager.jsx")
const {
  CONTINUE_LOCAL_REASON, EMPTY_NOTE, NO_LORAS_ROOT_REASON,
} = await import("../../bundled/video/frontend/videobank/videoCheckpoints.js")

// VideoCheckpointList now renders <PluginSlot slot="checkpoint.action"/"checkpoint.layer">
// (adopted for the Civitai action/layer rows), which resolves the plugin-sdk
// runtime — same host every other render test in this folder publishes.
const { configureHostRuntime } = await import('../src/plugins/runtimeHost.jsx')
const { publishRuntime } = await import('../src/plugins/loadPlugins.js')
test.beforeEach((t) => {
  const saved = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  t.after(() => Object.assign(globalThis, saved))
  globalThis.window = {}
  globalThis.document = { cookie: '', querySelector: () => null }
  globalThis.fetch = () => { throw new Error('A render must not contact a service') }
  configureHostRuntime()
  publishRuntime()
})

const file = (filename, extra = {}) => ({ filename, size: 314572800, deployed_as: null, undeployable: false, ...extra })
const PAYLOAD = {
  can_deploy: true, deploy_folder: 'h3/lds', delete_mode: 'app_trash',
  local: {
    run_name: 'video_city_ds9', folder: 'X:/out/video_city_ds9', active: false,
    steps: [
      { step: 50, final: false, deployed: false,
        files: [file('video_city_000000050_high_noise.safetensors'), file('video_city_000000050_low_noise.safetensors')] },
      { step: null, final: true, deployed: true,
        files: [file('video_city.safetensors', { deployed_as: 'h3/lds/video_city.safetensors', undeployable: true })] },
    ],
  },
  cloud: [],
}
const html = (props) => renderToStaticMarkup(createElement(VideoCheckpointList, { datasetId: 9, payload: PAYLOAD, ...props }))
const rowOf = (h, key) => {
  const at = h.indexOf(`data-step-key="${key}"`)
  assert.notEqual(at, -1, `no row for ${key}`)
  const from = h.lastIndexOf('<li', at)
  return h.slice(from, h.indexOf('</li>', at))
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')

test('an empty payload is one sentence, not a header over nothing', () => {
  const h = html({ payload: { local: null, cloud: [] } })
  assert.ok(h.includes(EMPTY_NOTE))
  assert.ok(!h.includes('<ul'))
})

test('a local Wan step: one ⬇ per file on the LOCAL route, 📦, the continue refusal, no ⓘ', () => {
  const row = rowOf(html(), 'local:50')
  assert.ok(row.includes('Step 50 — 2 files (both experts)'))
  const links = [...row.matchAll(/<a [^>]*href="([^"]+)"[^>]*download/g)].map((m) => m[1])
  assert.deepEqual(links, [
    '/api/video-dataset/9/train/checkpoint?filename=video_city_000000050_high_noise.safetensors',
    '/api/video-dataset/9/train/checkpoint?filename=video_city_000000050_low_noise.safetensors',
  ])
  assert.ok(row.includes('high noise') && row.includes('low noise') && row.includes('300 MB'))
  assert.match(row, /<button[^>]*>[^<]*<span aria-hidden="true">📦<\/span> Deploy → h3\/lds<\/button>/)
  assert.ok(row.includes(esc(CONTINUE_LOCAL_REASON)))
  assert.ok(!row.includes('Continue from here'))
  assert.ok(!row.includes('Details'))
  assert.match(row, /<button[^>]*>.*Delete the training saves<\/button>/s)
})

test('the local FINAL save reads "Final", carries the Deployed badge and a real ⏏ Undeploy button', () => {
  const row = rowOf(html(), 'local:final')
  assert.ok(row.includes('>Final</span>'))
  assert.ok(!row.includes('null'))
  assert.ok(row.includes('>Deployed</span>'))
  assert.match(row, /<button[^>]*>[^<]*<span aria-hidden="true">⏏<\/span> Undeploy<\/button>/)
  assert.ok(!row.includes('📦'))
})

test('no loras root on this install: every 📦 is the refusal, no deploy button anywhere', () => {
  const h = html({ payload: { ...PAYLOAD, can_deploy: false } })
  assert.ok(!h.includes('Deploy → '))
  assert.ok(h.includes(esc(NO_LORAS_ROOT_REASON)))
})

test('busy rows are disabled, and the verb says what it is doing', () => {
  const row = rowOf(html({ busy: 'local:50:deploy' }), 'local:50')
  assert.ok(row.includes('Deploying…'))
  assert.ok((row.match(/<button[^>]*disabled=""/g) || []).length >= 2)
})
