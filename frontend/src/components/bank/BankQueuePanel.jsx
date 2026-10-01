import { HelpBadge } from '../../help/HelpMode'
import { runningItems, waitingItems } from './bankQueueActions.js'

/** The cross-bank "Launch all" queue: which bank is running now and what is lined
 * up behind it. Drains one bank at a time per machine (never a busy-GPU 503), so
 * a user can queue several banks and walk away. Names are resolved from the
 * loaded banks.
 *
 * Two actions, never one: Clear waiting empties the line and leaves the running
 * bank alone; Stop running stops it. The page asks before either (see
 * bankQueueActions.js). The ✕ on a waiting row is one tap.
 *
 * THE ROW IS THE TARGET'S FRAME. The ✕ sits at the far end of a long row, and on
 * a wide screen nothing tied it to the name it removes. Hovering, focusing or
 * pressing anywhere in the row tints the whole row — number, name, status and ✕
 * — so the bank the ✕ belongs to is never a guess, on a mouse or a finger. */
const ACTION = 'min-h-10 lg:min-h-0 flex-1 sm:flex-none rounded border px-2 py-0.5 text-xs'
const ROW = 'group flex items-center gap-2 rounded-md px-1 text-sm transition-colors '
  + 'hover:bg-surface-raised focus-within:bg-surface-raised active:bg-surface-raised '
  + 'has-[:active]:bg-surface-raised'

export default function BankQueuePanel({ queue, nameOf, onCancel, onClearWaiting, onStopRunning }) {
  if (!queue?.items?.length) return null
  const waiting = waitingItems(queue).length
  const running = runningItems(queue).length
  return (
    <div className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-content">⏳ Launch-all queue</h2>
        <HelpBadge topic="bank-launch-queue" />
        <span className="text-xs text-content-muted">{queue.items.length} in line</span>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {waiting > 0 && (
            <button type="button" onClick={onClearWaiting}
              title="Remove every waiting bank. The running bank keeps going."
              className={`${ACTION} border-border text-content-muted hover:text-content hover:bg-surface-raised`}>
              Clear waiting
            </button>
          )}
          {running > 0 && (
            <button type="button" onClick={onStopRunning}
              title="Stop the running bank. Its finished steps are kept."
              className={`${ACTION} border-rose-400/50 text-rose-300 hover:bg-rose-500/15`}>
              Stop running
            </button>
          )}
        </div>
      </div>
      <ol className="space-y-1">
        {queue.items.map((it) => (
          <li key={it.bank_id} className={ROW}>
            <span className="w-5 shrink-0 text-right text-content-subtle">{it.position}.</span>
            <span className="flex min-w-0 grow flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="min-w-0 max-w-full truncate font-medium text-content">{nameOf(it.bank_id)}</span>
              {it.state === 'running' ? (
                <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-px text-2xs font-semibold text-emerald-300">running</span>
              ) : (
                <span className="shrink-0 rounded bg-surface-raised px-1.5 py-px text-2xs font-semibold text-content-muted">waiting</span>
              )}
              {/* Which machine, and why it hasn't started. The snapshot has
                  published both all along and this panel dropped them: twelve
                  banks queued to a peer looked byte-identical to twelve local
                  ones, and now that two can run at once, two "running" rows
                  would be indistinguishable. `waiting_for` was read nowhere in
                  the app despite snapshot()'s own comment saying it was shown
                  here — so a queue stalled on a stuck GPU flag looked dead. */}
              {it.device_label && (
                <span className="min-w-0 max-w-full truncate rounded bg-surface-raised px-1.5 py-px text-2xs text-content-muted">
                  on {it.device_label}
                </span>
              )}
              {it.state !== 'running' && it.waiting_for && (
                <span className="min-w-0 max-w-full truncate text-2xs text-amber-300" title={it.waiting_for}>
                  {it.waiting_for}
                </span>
              )}
            </span>
            {/* A small glyph in a finger-sized box: 40 px below lg, compact on
                a desktop. */}
            <button type="button" onClick={() => onCancel(it.bank_id)}
              aria-label={it.state === 'running'
                ? `Stop ${nameOf(it.bank_id)} and remove it from queue`
                : `Remove ${nameOf(it.bank_id)} from queue`}
              className="inline-flex min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 shrink-0 items-center justify-center rounded px-1.5 text-content-subtle group-hover:text-content hover:text-rose-300 focus-visible:text-rose-300">
              ✕
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
