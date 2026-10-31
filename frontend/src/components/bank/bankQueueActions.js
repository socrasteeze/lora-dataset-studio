/* ⏳ The Launch-all queue panel's two destructive actions, and what each one asks.
 *
 * There used to be one "Clear all", and it also cancelled the RUNNING pipeline:
 * tidying a long line stopped the bank that was halfway through its night. The
 * panel now splits it in two, and each asks first, naming the effect:
 *
 *   Clear waiting  — removes only the banks still waiting; the running one
 *                    keeps going (POST /api/bank-queue/clear {pending_only}).
 *   Stop running   — stops the running bank(s). Their finished steps are kept,
 *                    and the next waiting bank then starts.
 *
 * Removing ONE waiting row stays a single tap: it costs nothing to redo.
 * Removing the running row stops a run, so it asks the same question as Stop.
 */

const plural = (n, one, many) => (n === 1 ? one : many)

export const queueJobActive = (entry) => ['pending', 'running'].includes(entry?.state)
export const waitingItems = (queue) => (queue?.items || []).filter((i) => i.state === 'pending')
export const runningItems = (queue) => [
  ...(queue?.active_jobs || []), ...(queue?.items || []).filter((i) => i.state === 'running'),
]

/** "Remove 12 waiting banks? The running bank keeps going." — or null when
 *  nothing is waiting. */
export function clearWaitingConfirm(queue) {
  const n = waitingItems(queue).length
  if (!n) return null
  const running = runningItems(queue).length
  const tail = running === 0 ? ''
    : running === 1 ? ' The running bank keeps going.' : ' The running banks keep going.'
  return `Remove ${n} waiting ${plural(n, 'bank', 'banks')}?${tail}`
}

/** "Stop <name>? Its finished steps are kept." — for the Stop button and for
 *  the running row's ✕ alike, so both say the same thing. Null when nothing
 *  runs. `items` defaults to every running entry. */
export function stopRunningConfirm(queue, nameOf, items = runningItems(queue)) {
  const n = items.length
  if (!n) return null
  const waiting = waitingItems(queue).length
  const next = waiting ? ' The next waiting bank then starts.' : ''
  if (n === 1) return `Stop ${nameOf(items[0].bank_id)}? Its finished steps are kept.${next}`
  const names = items.map((i) => nameOf(i.bank_id)).join(', ')
  return `Stop ${n} running banks (${names})? Their finished steps are kept.${next}`
}

/** The ✕ on one row: null for a waiting row (one tap, nothing to lose), the
 *  stop question for a running one. */
export function removeQueuedConfirm(queue, nameOf, bankId) {
  const item = (queue?.items || []).find((i) => i.bank_id === bankId)
  if (!item || item.state !== 'running') return null
  return stopRunningConfirm(queue, nameOf, [item])
}

/* Live progress for a running queue row, so the panel answers "how far is it?"
   without opening the bank. `progress` is the server's {step, step_index,
   step_count, done, total, detail, eta_seconds}; `labelOf` names a pass kind. */
export function queueProgressLine(progress, labelOf) {
  if (!progress) return ''
  const parts = []
  const count = Number(progress.step_count)
  const index = Number(progress.step_index)
  if (count > 1 && Number.isFinite(index)) parts.push(`Step ${index + 1}/${count}`)
  const pass = progress.step ? labelOf(progress.step) : ''
  if (pass) parts.push(pass)
  const done = Number(progress.done)
  const total = Number(progress.total)
  if (total > 0 && Number.isFinite(done)) parts.push(`${done} / ${total}`)
  else if (progress.detail) parts.push(String(progress.detail))
  const eta = Number(progress.eta_seconds)
  if (eta > 0) parts.push(eta < 60 ? 'under a minute left' : `~${Math.round(eta / 60)} min left`)
  return parts.join(' · ')
}

/** 0–100 through the current step, or null when the step has no count. */
export function queueProgressPercent(progress) {
  const done = Number(progress?.done)
  const total = Number(progress?.total)
  if (!(total > 0) || !Number.isFinite(done)) return null
  return Math.max(0, Math.min(100, (done / total) * 100))
}
