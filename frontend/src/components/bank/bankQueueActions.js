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

export const waitingItems = (queue) => (queue?.items || []).filter((i) => i.state !== 'running')
export const runningItems = (queue) => (queue?.items || []).filter((i) => i.state === 'running')

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
