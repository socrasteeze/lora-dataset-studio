import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVE_LOCAL_REASON, CONTINUE_LOCAL_REASON, EMPTY_NOTE, HAND_PLACED_REASON,
  NO_LORAS_ROOT_REASON, checkpointGroups, deleteReport, deployReport,
  describeStepDelete, describeUndeploy, downloadLinks, fileShortName, fmtSize,
  groupSub, groupTitle, stepActionModel, stepKey, stepLabel, undeployReport,
} from '../../../../bundled/video/frontend/videobank/videoCheckpoints.js'
import { deleteDestination } from '../../utils/deletionWording.js'

const file = (filename, extra = {}) => ({ filename, size: 300 * 1024 * 1024, deployed_as: null, undeployable: false, ...extra })
const PAIR = [file('v_000000050_high_noise.safetensors'), file('v_000000050_low_noise.safetensors')]
const LOCAL = { run_name: 'video_city_ds9', active: false, steps: [
  { step: 50, final: false, deployed: false, files: PAIR },
  { step: null, final: true, deployed: true, files: [file('v.safetensors', { deployed_as: 'h3/lds/v.safetensors', undeployable: true })] },
] }
const [local] = checkpointGroups({ local: LOCAL, cloud: [{ run_id: 7, steps: [{ step: 9, files: [file('cloud.safetensors')] }] }] })

test('only the local run is listed and empty payloads stay empty', () => {
  assert.deepEqual(checkpointGroups({ local: LOCAL, cloud: [{ run_id: 7, steps: [{ step: 9 }] }] }).map((g) => g.key), ['local'])
  assert.deepEqual(checkpointGroups({ local: { steps: [] }, cloud: [] }), [])
  assert.ok(EMPTY_NOTE.includes('No checkpoints yet'))
  assert.equal(groupTitle(local), 'On this PC — video_city_ds9')
  assert.equal(groupSub(local), "this machine's run folder")
})

test('local saves download, deploy, delete, and explain their resume rule', () => {
  const a = stepActionModel(9, local, local.steps[0], { canDeploy: true, deployFolder: 'h3/lds' })
  assert.equal(a.key, 'local:50')
  assert.equal(a.label, 'Step 50 — 2 files (both experts)')
  assert.deepEqual(a.files.map((f) => f.short), ['high noise', 'low noise'])
  assert.ok(a.files.every((f) => f.url.startsWith('/api/video-dataset/9/train/checkpoint?filename=')))
  assert.deepEqual(a.continue, { reason: CONTINUE_LOCAL_REASON })
  assert.deepEqual(a.deploy, { ok: true, folder: 'h3/lds' })
  assert.equal(a.del.label, 'Delete the training saves')
  assert.equal(a.details, false)
})

test('active local saves cannot be deleted while the trainer writes them', () => {
  const busy = { ...local, active: true }
  assert.deepEqual(stepActionModel(9, busy, local.steps[0]).del, { reason: ACTIVE_LOCAL_REASON })
})

test('deployed saves can be undeployed only when this app owns the copy', () => {
  assert.deepEqual(stepActionModel(9, local, local.steps[1]).undeploy, { ok: true })
  const byHand = { step: 100, final: false, deployed: true, files: [file('b.safetensors', { deployed_as: 'h3/b.safetensors' })] }
  assert.deepEqual(stepActionModel(9, local, byHand).undeploy, { reason: HAND_PLACED_REASON })
  assert.deepEqual(stepActionModel(9, local, local.steps[0], { canDeploy: false }).deploy, { reason: NO_LORAS_ROOT_REASON })
})

test('delete and undeploy confirmations name files and the real destination', () => {
  const remove = describeStepDelete(local, local.steps[0], 'app_trash')
  assert.ok(remove.includes('v_000000050_high_noise.safetensors') && remove.includes(deleteDestination('app_trash')))
  assert.ok(!describeStepDelete(local, local.steps[0], 'permanent').includes('recoverable'))
  assert.ok(describeUndeploy(local.steps[1], 'app_trash').includes('The training save is KEPT'))
  assert.equal(undeployReport(local.steps[1]), 'Removed from ComfyUI: v.safetensors. The training save is kept.')
})

test('reports and display helpers describe the local files', () => {
  assert.equal(deleteReport({ removed: ['a'], files_kept: [], delete_mode: 'app_trash' }), `Moved 1 file to ${deleteDestination('app_trash')}.`)
  assert.equal(deployReport({ deployed: ['h3/lds/a.safetensors'], folder: 'h3/lds' }), 'Deployed → h3/lds: a.safetensors. The Video Test Studio lists it now.')
  assert.equal(stepLabel(local.steps[1]), 'Final')
  assert.equal(stepKey(local, local.steps[1]), 'local:final')
  assert.equal(fmtSize(300 * 1024 * 1024), '300 MB')
  assert.equal(fileShortName('a_high_noise.safetensors', 2), 'high noise')
  assert.equal(downloadLinks(9, local, local.steps[1])[0].url, '/api/video-dataset/9/train/checkpoint?filename=v.safetensors')
})
