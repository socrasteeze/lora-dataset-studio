import '../../../frontend/tests/plugin-sdk-host.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canvasContinueLanes, canvasContinueRefusal, canvasContinueRequest,
  canvasContinueRow, canvasContinueSettings, canvasContinueSteps,
} from '../frontend/utils/canvasContinue.js'

const LOCAL = {
  record_id: 12, source: 'local', status: 'done', dataset_id: 4,
  train_type: 'sdxl', variant: 'base', base_model: 'sdxl.safetensors',
  checkpoints: [{ step: 1000 }, { step: 2000, final: true }],
  config: { optimizer: 'prodigy', lr: 1, rank: 64 },
}

test('the board reads resumable local saves from the selected run', () => {
  assert.deepEqual(canvasContinueSteps(LOCAL), [1000, 2000])
  assert.deepEqual(canvasContinueSteps({ checkpoints: [{ step: 0 }, { step: null }] }), [])
  assert.equal(canvasContinueRow(LOCAL, [{ record_id: 12, masked: false }]).masked, false)
  assert.deepEqual(canvasContinueSettings(LOCAL), { optimizer: 'prodigy', learning_rate: 1, rank: 64 })
})

test('the local continuation lane states its blocker and never opens a rental lane', () => {
  const open = canvasContinueLanes(LOCAL, LOCAL.checkpoints[0], { aitoolkitValid: true })
  assert.equal(open.local.available, true)
  assert.equal(open.cloud.available, false)
  assert.match(open.cloud.reason, /own machine only/)

  const blocked = canvasContinueLanes(LOCAL, LOCAL.checkpoints[0], { aitoolkitValid: false })
  assert.equal(blocked.local.available, false)
  assert.match(blocked.local.reason, /ai-toolkit/)
})

test('a missing local save cannot be continued', () => {
  const lanes = canvasContinueLanes(LOCAL, { step: 1000, present: false }, { aitoolkitValid: true })
  assert.equal(lanes.local.available, false)
  assert.match(lanes.local.reason, /no longer on this machine/)
  assert.match(canvasContinueRefusal({ ...LOCAL, checkpoints: [] }, null), /no checkpoint/)
})

test('the board posts only the local continuation endpoint and payload', () => {
  const request = canvasContinueRequest(LOCAL, {
    lane: 'local', fromStep: 1000, extraSteps: 500, resumeMode: 'weights_only',
  })
  assert.deepEqual(request, {
    url: '/api/dataset/4/train/continue',
    body: {
      extra_steps: 500, from_step: 1000, expected_record_id: 12, resume_mode: 'weights_only',
      base_model: 'sdxl.safetensors', train_type: 'sdxl', variant: 'base',
    },
  })
  assert.equal(canvasContinueRequest(LOCAL, { lane: 'cloud', extraSteps: 500 }), null)
})
