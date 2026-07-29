/* ⏹ Stop everything, and the stuck "GPU busy" — the decidable half, JSX-free.
 *
 * The app gates every GPU pass, every queued bank and every training start on
 * two server flags. A process that dies without clearing one leaves everything
 * refusing with a "GPU busy" that is not true, and the flag's TTL does not
 * rescue it (the window re-arms the TTL from a heartbeat while it is open). The
 * only recovery used to be restarting the app.
 *
 * The reporting rule this file exists to keep: a global stop must NEVER answer a
 * blanket "done". This fork already refuses to report a training stop it could
 * not verify, and a generation cancel names the subset it could not confirm.
 * Flattening all that into one green toast would undo it — so a target that
 * could not be confirmed is carried through to the user, by name.
 */

/** Rank of a per-target state, worst first. Drives the headline tone: one
 *  unconfirmed target is the whole result's honesty problem. */
const SEVERITY = { failed: 0, unconfirmed: 1, stopped: 2, idle: 3 }

/** Sentence + tone for the "is the GPU really busy?" banner, or null when there
 *  is nothing to say. Only a STALE flag gets a banner: a flag a live pass owns
 *  is correct, and offering to clear it would invite someone to break their own
 *  running job. */
export function staleFlagNotice(state) {
  if (!state?.any_set || !state.stale) return null
  const which = []
  if (state.flags?.training_in_progress) which.push('a training run')
  if (state.flags?.vision_in_progress) which.push('a vision/GPU pass')
  return {
    tone: 'warn',
    text: `The app still thinks ${which.join(' and ')} owns the GPU, but nothing is `
      + 'running. That is a leftover flag — passes and queued banks will keep '
      + 'refusing with "GPU busy" until it is cleared.',
    action: 'Clear it — nothing is using the GPU',
  }
}

/** What ⏹ Stop everything actually did, per target. `tone` is the worst outcome
 *  present, never an average: "3 of 5 stopped" reads as success, and the two
 *  that did not are the entire reason to look. */
export function stopSummary(report) {
  const targets = (report?.targets || []).filter(Boolean)
  const worst = targets.reduce(
    (acc, t) => Math.min(acc, SEVERITY[t.state] ?? 3), 3)
  const failed = targets.filter((t) => t.state === 'failed')
  const unconfirmed = targets.filter((t) => t.state === 'unconfirmed')
  const stopped = targets.filter((t) => t.state === 'stopped')
  let headline
  if (failed.length) {
    headline = `Stopped what it could — ${failed.length} could not be stopped.`
  } else if (unconfirmed.length) {
    headline = `Stop sent — ${unconfirmed.length} could not be confirmed.`
  } else if (stopped.length) {
    headline = `Stopped ${stopped.length} thing${stopped.length === 1 ? '' : 's'}.`
  } else {
    headline = 'Nothing was running.'
  }
  return {
    tone: worst === 0 ? 'error' : worst === 1 ? 'warn' : 'ok',
    headline,
    // The flags are the reason most people press this, so they get their own
    // line rather than being inferred from the target list.
    flags: flagLine(report),
    targets: [...targets].sort(
      (a, b) => (SEVERITY[a.state] ?? 3) - (SEVERITY[b.state] ?? 3)),
  }
}

/** The GPU-flag half of the report, in one sentence. null when nothing was
 *  flagged — the ordinary case, and silence is right for it. */
export function flagLine(report) {
  const cleared = report?.cleared || []
  const held = report?.held || []
  const parts = []
  if (cleared.length) parts.push('The GPU is free again.')
  for (const h of held) {
    // Never softened: a held training flag means the trainer is still alive, and
    // reporting the GPU as free there is the one lie this whole path forbids.
    parts.push(`The GPU is still marked busy — ${h.reason}.`)
  }
  return parts.length ? parts.join(' ') : null
}

/** The confirm sentence. It is destructive to in-flight work by design, so it
 *  says what is lost rather than asking "are you sure?". */
export const STOP_CONFIRM =
  'Stop everything that is running?\n\n'
  + 'This cancels queued and running bank passes, dataset batches and in-flight '
  + 'generations, asks ComfyUI to unload, and stops training. Work already '
  + 'written to disk is kept — passes that cache their progress resume where they '
  + 'stopped. Anything mid-flight is lost.'
