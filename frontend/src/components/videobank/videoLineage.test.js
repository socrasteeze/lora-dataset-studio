/* The bridge between the local video-run graph and the checkpoint step model. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_GRAPH_NOTE, PREVIEWS_NOTE, graphSummary, nodeGroup, pillActionModel, pillKey,
  pillPreview, pillStep, samplesOfStep, videoDeployHint,
} from './videoLineage.js'
import { CONTINUE_LOCAL_REASON, stepActionModel } from './videoCheckpoints.js'
import { runNumber, runIdentityLabel } from '../../utils/runIdentity.js'

const file = (filename, extra = {}) => ({ filename, size: 1, deployed_as: null, undeployable: false, ...extra })
const LOCAL = {
  record_id: -9, run_id: null, source: 'local', status: null, active: false,
  run_name: 'video_x_ds9',
  checkpoints: [
    { step: 50, final: false, testable: false, preview_url: '/sample.jpg',
      preview_status: 'ready', preview_count: 2,
      files: [file('v_000000050_high_noise.safetensors'), file('v_000000050_low_noise.safetensors')] },
    { step: null, final: true, testable: false, preview_url: null,
      preview_status: null, preview_count: 0, files: [file('v.safetensors')] },
  ],
}

test('the local node becomes the group the list reasons about, a pill the step', () => {
  assert.deepEqual(nodeGroup(LOCAL), {
    key: 'local', lane: 'local', run_id: null, active: false, status: null,
    run_name: 'video_x_ds9', parent_run_id: null, steps: LOCAL.checkpoints,
  })
  assert.deepEqual(pillStep(LOCAL.checkpoints[0]), {
    step: 50, final: false, deployed: false, files: LOCAL.checkpoints[0].files,
  })
  assert.equal(pillKey(LOCAL, LOCAL.checkpoints[0]), 'local:50')
  assert.equal(pillKey(LOCAL, LOCAL.checkpoints[1]), 'local:final')
})

test('the graph popover and list row make the same local-only decision', () => {
  const fromGraph = pillActionModel(9, LOCAL, LOCAL.checkpoints[0], { canDeploy: true })
  const fromList = stepActionModel(9, nodeGroup(LOCAL), pillStep(LOCAL.checkpoints[0]), { canDeploy: true })
  assert.deepEqual(fromGraph, fromList)
  assert.deepEqual(fromGraph.continue, { reason: CONTINUE_LOCAL_REASON })
  assert.deepEqual(fromGraph.files.map((f) => f.short), ['high noise', 'low noise'])
  assert.ok(fromGraph.files.every((f) => f.url.startsWith('/api/video-dataset/9/train/checkpoint?filename=')))
})

test('a preview is the training sample at that step, with its count; none is null', () => {
  assert.deepEqual(pillPreview(LOCAL.checkpoints[0]), {
    status: 'ready', url: LOCAL.checkpoints[0].preview_url, count: 2,
  })
  assert.equal(pillPreview(LOCAL.checkpoints[1]), null)
  assert.deepEqual(pillPreview({ preview_url: '/x.jpg' }), { status: null, url: '/x.jpg', count: 1 })
})

test('samples of a step come in prompt order, other steps excluded', () => {
  const all = [{ step: 100, prompt_idx: 1 }, { step: 50, prompt_idx: 0 }, { step: 100, prompt_idx: 0 }]
  assert.deepEqual(samplesOfStep(all, 100).map((sample) => sample.prompt_idx), [0, 1])
  assert.deepEqual(samplesOfStep(all, null), [])
  assert.deepEqual(samplesOfStep(undefined, 100), [])
})

test("the pill title's deploy sentence is true of this lane", () => {
  assert.equal(videoDeployHint({ testable: true }), ' — deployed to ComfyUI (the Video Studio lists it)')
  assert.equal(videoDeployHint({ testable: false }), ' — not deployed — 📦 Deploy from its actions to test it in the Studio')
  assert.equal(videoDeployHint({ present: false }), ' — this save is no longer on disk')
  assert.ok(!videoDeployHint({}).includes('Generate'))
})

test("the local node's borrowed negative id is never printed as a run number", () => {
  assert.equal(runNumber(LOCAL), 'local')
  assert.equal(runIdentityLabel(LOCAL), 'Run local')
  assert.equal(runNumber({ record_id: 0 }), '#0')
})

test('the fold summary counts local saves and previews', () => {
  assert.equal(graphSummary({ nodes: [LOCAL] }), '1 run · 2 saves · 2 previews')
  assert.equal(graphSummary(null), '0 runs · 0 saves · 0 previews')
  assert.ok(PREVIEWS_NOTE.includes('Studio') && EMPTY_GRAPH_NOTE.includes('No run'))
})
