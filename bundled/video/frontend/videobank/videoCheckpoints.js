/* 📦 Pure brain of the video workspace's Checkpoints & LoRAs section — every
   decision the list makes about a SAVE, JSX-free so `node --test` can pin them.

   The image lane's checkpoint popover (components/dataset/checkpointPopover.js)
   decides per FILE; this one decides per STEP, and that is the whole reason it
   is a second file rather than a second caller of the first: a Wan 2.2
   checkpoint is two files at one step, and a per-file model offers half a LoRA
   without noticing. Same verbs, same rule — an action is live, or shown with
   its real reason, or absent; never a button that fails in silence — same
   wording where the behaviour is the same, and a DIFFERENT sentence where it is
   not (a local video run cannot pick a step to continue from; see
   CONTINUE_LOCAL_REASON), which is CLAUDE.md's parity rule made literal. */
import { deleteDestination, isRecoverable } from '@lds/plugin-sdk/data'
import { videoDatasetLocalCheckpointUrl } from './videoBankApi.js'

export function stepLabel(step) {
  if (!step) return ''
  const n = step.files?.length || 0
  const head = step.final
    ? (step.step != null ? `Final (step ${step.step})` : 'Final')
    : `Step ${step.step}`
  return n > 1 ? `${head} — ${n} files (both experts)` : head
}

export const EMPTY_NOTE = 'No checkpoints yet — train this dataset, and each save appears here.'

/* Why a LOCAL save offers no ▶ Continue: ai-toolkit resumes from whatever it
   finds in the run folder, so the next local launch continues from the NEWEST
   save whatever row the click came from. Offering the button would do
   something other than what it says. */
export const CONTINUE_LOCAL_REASON = 'Resumes from its newest save on the next '
  + 'local launch — the run folder is the resume state, so no step is picked here'
export const ACTIVE_LOCAL_REASON = 'Training is running and still writing these '
  + 'saves — stop it first'
export const NO_LORAS_ROOT_REASON = 'ComfyUI\'s loras folder is not configured — '
  + 'nothing to deploy into'
export const HAND_PLACED_REASON = 'Deployed by hand — remove it from ComfyUI\'s '
  + 'loras folder yourself'

/** The local run, when it has at least one save. */
export function checkpointGroups(payload) {
  const out = []
  const local = payload?.local
  if (local?.steps?.length) {
    out.push({
      key: 'local', lane: 'local', run_id: null, active: !!local.active,
      run_name: local.run_name, folder: local.folder, parent_run_id: null,
      status: local.active ? 'training' : 'done', steps: local.steps,
    })
  }
  return out
}

export function groupTitle(group) {
  return `On this PC — ${group.run_name || 'local run'}`
}

export function groupSub(group, now = Date.now()) {
  return group.active ? 'training now — saves still being written' : 'this machine\'s run folder'
}

export function fmtSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** The short name a ⬇ link shows: the expert of a Wan pair, else the file. */
export function fileShortName(filename, fileCount = 1) {
  const name = String(filename || '')
  if (fileCount > 1) {
    if (/_high_noise\.safetensors$/i.test(name)) return 'high noise'
    if (/_low_noise\.safetensors$/i.test(name)) return 'low noise'
  }
  return name
}

export function stepKey(group, step) {
  return `${group.key}:${step.final ? 'final' : step.step}`
}

/** One ⬇ per FILE — both halves of a pair side by side is what the loaders
 * expect; the URL comes from the lane the save belongs to. */
export function downloadLinks(datasetId, group, step) {
  const files = step.files || []
  return files.map((f) => ({
    filename: f.filename,
    short: fileShortName(f.filename, files.length),
    size: f.size,
    url: videoDatasetLocalCheckpointUrl(datasetId, f.filename),
  }))
}

/**
 * Everything a step's row renders, decided in one place.
 *
 *   { key, label, files, deployed,
 *     continue: {ok:true}|{reason},
 *     deploy:   {ok:true, folder}|{reason}|null   (null when deployed),
 *     undeploy: {ok:true}|{reason}|null           (null when not deployed),
 *     del:      {ok:true, label, title}|{reason},
 *     details:  bool }
 *
 * `ctx.deleteMode` is the server's `delete_mode`: the 🗑 title names the real
 * destination through the app-wide wording, never a "trash" typed here.
 */
export function stepActionModel(datasetId, group, step, ctx = {}) {
  const { canDeploy = true, deployFolder = 'h3/lds', deleteMode = 'app_trash' } = ctx
  const files = step.files || []
  const deployed = !!step.deployed && files.length > 0
  const cont = { reason: CONTINUE_LOCAL_REASON }

  let deploy = null
  let undeploy = null
  if (deployed) {
    undeploy = files.every((f) => f.undeployable) ? { ok: true } : { reason: HAND_PLACED_REASON }
  } else {
    deploy = canDeploy ? { ok: true, folder: deployFolder } : { reason: NO_LORAS_ROOT_REASON }
  }

  let del
  if (group.active) del = { reason: ACTIVE_LOCAL_REASON }
  else {
    del = {
      ok: true,
      label: files.length > 1 ? 'Delete the training saves' : 'Delete the training save',
      title: `Move every file of this step to ${deleteDestination(deleteMode)}`
        + (isRecoverable(deleteMode) ? ' — recoverable until you empty it' : ''),
    }
  }

  return {
    key: stepKey(group, step), label: stepLabel(step),
    files: downloadLinks(datasetId, group, step),
    deployed, continue: cont, deploy, undeploy, del, details: false,
  }
}

const quoted = (files) => (files || []).map((f) => `“${f.filename}”`).join(' + ')

export function stepUsesBest(step, loras = []) {
  const normalize = (name) => String(name || '').replaceAll('\\', '/')
  const pins = new Set(loras.map(normalize).filter(Boolean))
  return !!step?.best_settings || (step?.files || []).some((f) => f.deployed_as && pins.has(normalize(f.deployed_as)))
}

const BEST_WARNING = '\n\n★ This checkpoint is used by the dataset’s best settings. '
  + 'The saved settings are kept; applying them requires this LoRA to be available in ComfyUI.'

/** The 🗑 confirmation. Names every file the click moves and the destination —
 * from the app-wide wording, never a sentence of this file's own. */
export function describeStepDelete(group, step, mode, bestLoras = []) {
  const files = step.files || []
  const many = files.length > 1
  const where = deleteDestination(mode)
  const lines = [
    `DELETE THE TRAINING SAVE${many ? 'S' : ''} — ${quoted(files)} (${stepLabel(step)})?`, '',
    many
      ? 'These are the run\'s own checkpoint files — both experts of the pair go together, never half.'
      : 'This is the run\'s own checkpoint file, not a ComfyUI copy.',
    isRecoverable(mode)
      ? `${many ? 'They go' : 'It goes'} to ${where} — recoverable until you empty it.`
      : `${many ? 'They go' : 'It goes'} to ${where}.`,
  ]
  if (deployed(step)) {
    lines.push('', 'The copy deployed into ComfyUI is a separate file and is KEPT — use ⏏ Undeploy for that one.')
  }
  return lines.join('\n') + (stepUsesBest(step, bestLoras) ? BEST_WARNING : '')
}

const deployed = (step) => !!step?.deployed

export function describeUndeploy(step, mode = 'app_trash', bestLoras = []) {
  const files = (step.files || []).filter((f) => f.deployed_as)
  return [
    `UNDEPLOY — REMOVE FROM COMFYUI — ${quoted(files)} (${stepLabel(step)})?`, '',
    `Only the copy in ComfyUI's loras folder goes to ${deleteDestination(mode)}.`,
    'The training save is KEPT — this step offers to deploy again right after.',
  ].join('\n') + (stepUsesBest(step, bestLoras) ? BEST_WARNING : '')
}

/** The run-level 🗑 the training block used to carry, moved here unchanged:
 * this one removes the run's files and its history line for good (the server
 * deletes the store directory by name — no trash), and says so. */
export function deleteReport(res = {}) {
  const removed = res.removed || []
  const kept = res.files_kept || []
  const where = deleteDestination(res.delete_mode)
  const head = removed.length
    ? `Moved ${removed.length} file${removed.length === 1 ? '' : 's'} to ${where}.`
    : 'Nothing was moved.'
  if (!kept.length) return head
  return `${head} ${kept.length} file${kept.length === 1 ? '' : 's'} kept — held open by `
    + `another program: ${kept.join(', ')}.`
}

export function deployReport(res = {}) {
  const names = (res.deployed || []).map((n) => String(n).split(/[\\/]/).pop())
  return `Deployed → ${res.folder || 'h3/lds'}: ${names.join(' + ')}. The Video Test Studio lists it now.`
}

export function undeployReport(step) {
  const files = (step?.files || []).filter((f) => f.deployed_as)
  return `Removed from ComfyUI: ${files.map((f) => f.filename).join(' + ')}. The training save is kept.`
}
