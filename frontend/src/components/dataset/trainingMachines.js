/* Which machines the training picker offers, and how a run on one reads.
 *
 * Kept out of the .jsx deliberately — `node --test` cannot import JSX, and the
 * two rules worth pinning are both here rather than in the markup.
 *
 * Rule 1: **this machine is never in the list.** `/api/training/machines`
 * returns the configured ai-toolkit's own cards alongside its peers', because
 * an empty list and a list with no peers are different states and the picker
 * has to tell them apart. But the ai-toolkit this app submits to IS this
 * machine (it reads the same exported dataset folder off the same disk), so its
 * bare GPU indices are the local GPU under another name. Offering them would be
 * a second way to train locally that does NOT set `training_in_progress` —
 * generation and the bank's GPU passes would start on top of the run. The
 * server refuses one anyway (`peer_training.launch`); the picker simply never
 * shows it.
 *
 * Rule 2: **an offline machine is listed, disabled, with its reason.** Hiding
 * it reads exactly like never having configured it — the sibling project's
 * rule, and the one this app's Run-on picker already follows.
 */

/** The value meaning "the local path, unchanged". Never sent to the server. */
export const LOCAL_MACHINE = 'local'

/** Machines the picker may offer: peers of the configured ai-toolkit only. */
export function remoteMachines(machines) {
  return (machines || []).filter((m) => m && m.remote)
}

/**
 * What the picker says about the ai-toolkit itself, or '' when there is
 * nothing to say. Three distinguishable states, because "no peers" and "the
 * address does not answer" need different fixes from the user.
 */
export function machineNote({ configured, machines, error } = {}) {
  if (!configured) return ''
  const list = machines || []
  if (error || list.length === 0) {
    return 'The ai-toolkit at that address did not answer — check it is running.'
  }
  if (remoteMachines(list).length === 0) {
    return 'That ai-toolkit has no other machines configured, so there is nowhere else to send a run.'
  }
  return ''
}

/* Its OWN key, not `deviceMemory.js`'s. That module falls back to the shared
   legacy key when a kind has nothing stored, which would hand this picker a
   ClusterDevice uuid — an id no <option> here can match, so the browser would
   paint "This machine" while the value said otherwise. Different namespace,
   different key. */
const MACHINE_KEY = 'lds.training.machine_id'

export function loadSavedMachine() {
  try {
    return localStorage.getItem(MACHINE_KEY) || LOCAL_MACHINE
  } catch {
    return LOCAL_MACHINE                 // private mode
  }
}

export function saveMachine(id) {
  try {
    localStorage.setItem(MACHINE_KEY, id || LOCAL_MACHINE)
  } catch { /* private mode */ }
}

/**
 * The machine actually usable now, given what was remembered. A remembered
 * machine that has since gone offline — or been removed from the ai-toolkit
 * entirely — falls back to this machine VISIBLY, so what the picker shows is
 * what a launch will do. The bank's picker had to learn this the hard way: with
 * no matching <option> a browser paints the first one, so the dialog read
 * "this machine" while it posted a peer.
 */
export function reconcileMachine(saved, machines) {
  const wanted = saved || LOCAL_MACHINE
  if (wanted === LOCAL_MACHINE) return LOCAL_MACHINE
  const hit = remoteMachines(machines).find((m) => m.id === wanted)
  return hit && hit.available ? wanted : LOCAL_MACHINE
}

/** One `<option>`: its text, and whether it can be chosen. */
export function machineOption(machine) {
  const label = machine.label || machine.id
  return {
    id: machine.id,
    label: machine.available ? label : `${label} (unavailable)`,
    disabled: !machine.available,
  }
}

/* Every status `PeerTrainingRun` actually takes, in order. `running` is the
   long one; the rest are seconds. An unknown status falls through to itself
   rather than to a blank, so a status added server-side still reads — but it is
   listed here or it is not shown in words, which is why this stays in step with
   `peer_training.py` rather than guessing at extra phases. */
const PHASE_TEXT = {
  preparing: 'Preparing',
  queued: 'Queued',
  running: 'Training',
  done: 'Finished',
  failed: 'Failed',
  stopped: 'Stopped',
}

/** True while the run still occupies the other machine. */
export const TERMINAL_STATUSES = ['done', 'failed', 'stopped']
export const isActiveRun = (run) => !!run && !TERMINAL_STATUSES.includes(run.status)

/**
 * The status card's single line. Step counts are only shown once BOTH numbers
 * are known: "step 0 of null" is worse than no number at all, and the remote
 * job reports its total only after it has started.
 */
export function peerRunLine(run) {
  if (!run) return ''
  const where = run.machine_label || run.gpu_ids || 'another machine'
  const phase = PHASE_TEXT[run.status] || run.status
  const parts = [`${phase} on ${where}`]
  if (run.step && run.total_steps) parts.push(`step ${run.step} / ${run.total_steps}`)
  if (run.stop_requested && isActiveRun(run)) parts.push('stop requested')
  // While it trains, phase_detail is the remote job's own `info` — which
  // already repeats the step count the line just showed. Everywhere else it is
  // the only thing saying what is happening.
  if (run.phase_detail && run.status !== 'running') parts.push(run.phase_detail)
  if (run.error) parts.push(run.error)
  return parts.join(' · ')
}
