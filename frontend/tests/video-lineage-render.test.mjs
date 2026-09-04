/**
 * The local video run rendered with the shared lineage cards and checkpoint
 * pills. Divergence 4 keeps no rented-pod nodes or continuation edges.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, renderToStaticMarkup } from './support/mountJsx.mjs'

const { default: VideoLineageGraph, VideoCheckpointPopover } =
  await import('../src/components/videobank/VideoLineageGraph.jsx')
const { default: VideoSampleLightbox } = await import('../src/components/videobank/VideoSampleLightbox.jsx')
const { pillActionModel } = await import('../src/components/videobank/videoLineage.js')

const file = (filename, extra = {}) => ({
  filename, size: 314572800, deployed_as: null, undeployable: false, ...extra,
})
const POSTER = '/api/video-dataset/9/train/sample/poster?filename=1725__000000100_0.mp4'
const TREE = {
  root_id: null, current_id: null, single: true, edges: [],
  nodes: [{
    record_id: -9, run_id: null, source: 'local', parent_record_id: null,
    resumed_from: null, origin_unknown: false, dataset_id: 9, dataset_name: 'City',
    train_type: 'video', variant: 'wan22_14b', base_model: '', version: null,
    steps: 2000, config: {}, note: '', has_note: false, is_current: false,
    created_at: null, status: null, active: false, training_mode: 'lora',
    run_name: 'video_city_ds9', saves: 3, checkpoint_ready: true,
    checkpoints: [
      { step: 100, final: false, filename: 'a_000000100_high_noise.safetensors',
        present: true, testable: false, deployed_filename: null, preview_url: POSTER,
        preview_status: 'ready', preview_count: 2,
        download_url: '/api/video-dataset/9/train/checkpoint?filename=a_000000100_high_noise.safetensors',
        files: [file('a_000000100_high_noise.safetensors'), file('a_000000100_low_noise.safetensors')] },
      { step: 2000, final: true, filename: 'a.safetensors', present: true,
        testable: true, deployed_filename: 'h3/lds/a.safetensors', preview_url: null,
        preview_status: null, preview_count: 0,
        download_url: '/api/video-dataset/9/train/checkpoint?filename=a.safetensors',
        files: [file('a.safetensors', { deployed_as: 'h3/lds/a.safetensors', undeployable: true })] },
    ],
  }],
}
const html = (props) => renderToStaticMarkup(createElement(VideoLineageGraph,
  { datasetId: 9, tree: TREE, onPlaySample: () => {}, ...props }))

test('one local run card has one pill per step and no continuation edge', () => {
  const markup = html()
  assert.equal((markup.match(/class="lds-gcard/g) || []).length, 1)
  assert.equal((markup.match(/lds-ckpill/g) || []).length >= 2, true)
  assert.ok(markup.includes('>Video<') || markup.includes('Video ·') || /Video/.test(markup))
  assert.ok(markup.includes('aria-label="Lineage graph: 1 runs"'))
  assert.equal((markup.match(/class="[^"]*lds-ledge/g) || []).length, 0)
  assert.ok(!markup.includes('<video'))
})

test('compact pills count samples; big previews render one still', () => {
  const compact = html()
  assert.ok(compact.includes('aria-label="Open the 2 samples of step 100"'))
  assert.ok(compact.includes('🎬'))
  assert.ok(!compact.includes('<img '))
  assert.ok(compact.includes('Deploy from its actions'))
  globalThis.localStorage = {
    getItem: (key) => (key === 'lds.videoGraphBigPreviews' ? '1' : null), setItem() {},
  }
  try {
    const big = html()
    assert.ok(big.includes(POSTER.replace(/&/g, '&amp;')))
    assert.equal((big.match(/<img /g) || []).length, 1)
  } finally {
    delete globalThis.localStorage
  }
})

test('the popover offers only local checkpoint verbs, one download per file', () => {
  const node = TREE.nodes[0]
  const pill = node.checkpoints[0]
  const markup = renderToStaticMarkup(createElement(VideoCheckpointPopover, {
    node, pill, a: pillActionModel(9, node, pill, { canDeploy: true }), onClose: () => {},
  }))
  const links = [...markup.matchAll(/<a [^>]*href="([^"]+)"[^>]*download/g)]
    .map((match) => match[1].replace(/&amp;/g, '&'))
  assert.deepEqual(links, [
    '/api/video-dataset/9/train/checkpoint?filename=a_000000100_high_noise.safetensors',
    '/api/video-dataset/9/train/checkpoint?filename=a_000000100_low_noise.safetensors',
  ])
  assert.ok(markup.includes('Play samples (2)'))
  assert.ok(!markup.includes('Continue from here') && markup.includes('newest save'))
  assert.ok(markup.includes('Deploy → h3/lds'))
  assert.ok(!markup.includes('Details') && markup.includes('Delete the training saves'))
})

test('the sample lightbox has one player slot and a close control', () => {
  const markup = renderToStaticMarkup(createElement(VideoSampleLightbox, {
    datasetId: 9, target: { node: TREE.nodes[0], pill: TREE.nodes[0].checkpoints[0] },
    onClose: () => {},
  }))
  assert.ok(markup.includes('data-probe-chrome="sample-lightbox" data-probe-layer'))
  assert.ok(markup.includes('aria-label="Close"'))
  assert.ok(markup.includes('Step 100'))
  assert.ok(!markup.includes('<video'))
  assert.equal(renderToStaticMarkup(createElement(VideoSampleLightbox, {
    datasetId: 9, target: null, onClose: () => {},
  })), '')
})
