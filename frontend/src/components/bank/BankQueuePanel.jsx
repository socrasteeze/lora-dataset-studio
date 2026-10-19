import { HelpBadge } from '../../help/HelpMode'
import { jobLabel } from './bankPassRun.js'
import { runningItems, waitingItems } from './bankQueueActions.js'

/** The cross-bank job queue: which bank is running now and what is lined
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
const ROW = 'group grid grid-cols-[1.25rem_minmax(0,1fr)_2.5rem] items-center gap-x-2 gap-y-0.5 rounded-md px-1 py-1 text-sm transition-colors '
  + 'sm:grid-cols-[1.25rem_minmax(0,1fr)_12rem_4.5rem_2.5rem] '
  + 'hover:bg-surface-raised focus-within:bg-surface-raised active:bg-surface-raised '
  + 'has-[:active]:bg-surface-raised'
const NAME = 'col-start-2 row-start-1 min-w-0 [overflow-wrap:anywhere] font-medium text-content'
const JOB_STATUS = 'col-start-2 row-start-2 grid min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2 sm:contents'
const JOB = 'min-w-0 [overflow-wrap:anywhere] text-xs text-content-muted sm:col-start-3 sm:row-start-1'
const STATUS = 'justify-self-start whitespace-nowrap rounded px-1.5 py-px text-2xs font-semibold sm:col-start-4 sm:row-start-1'
const DETAILS = 'col-start-2 row-start-3 flex min-w-0 flex-wrap items-center gap-2 sm:col-end-5 sm:row-start-2'
const CONTROL = 'col-start-3 row-start-1 row-span-2 inline-flex min-h-10 min-w-0 w-10 items-center justify-center rounded px-1.5 sm:col-start-5 sm:row-span-1 lg:min-h-0'

export default function BankQueuePanel({ queue, nameOf, onCancel, onRetry, onClearWaiting, onStopRunning, onStopDirect }) {
  const active = queue?.active_jobs || []
  const queued = queue?.items || []
  if (!queued.length && !active.length) return null
  const waiting = waitingItems(queue).length
  const running = runningItems(queue).length
  return (
    <div data-bank-queue className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-content">⏳ Bank Queue</h2>
        <HelpBadge topic="bank-launch-queue" />
        <span className="text-xs text-content-muted">{queued.length} in line</span>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {waiting > 0 && (
            <button type="button" onClick={onClearWaiting}
              title="Remove every waiting bank. The running bank keeps going."
              className={`${ACTION} border-border text-content-muted hover:text-content hover:bg-surface-raised`}>
              Clear Waiting
            </button>
          )}
          {running > 0 && (
            <button type="button" onClick={onStopRunning}
              title="Stop the running bank. Its finished steps are kept."
              className={`${ACTION} border-rose-400/50 text-rose-300 hover:bg-rose-500/15`}>
              Stop Running
            </button>
          )}
        </div>
      </div>
      {active.length > 0 && <div className="space-y-1">
        <h3 className="text-xs font-semibold text-content-muted">Active Passes</h3>
        <ul className="space-y-1">
          {active.map((job) => <li key={`${job.bank_id}:${job.started_at}`} className={ROW} data-queue-row="active" data-bank-id={job.bank_id}>
            <span data-queue-cell="name" className={NAME}>{nameOf(job.bank_id)}</span>
            <div className={JOB_STATUS}>
              <span data-queue-cell="job" className={JOB}>{jobLabel(job.kind)}</span>
              <span data-queue-cell="status" className={`${STATUS} bg-emerald-500/15 text-emerald-300`}>Running</span>
            </div>
            {job.device_label && <span data-queue-private className={`${DETAILS} [overflow-wrap:anywhere] text-xs text-content-muted`}>on {job.device_label}</span>}
            <button type="button" onClick={() => onStopDirect(job.bank_id)}
              aria-label={`Stop ${nameOf(job.bank_id)}`}
              data-queue-cell="control" className={`${CONTROL} border border-rose-400/50 text-xs text-rose-300`}>Stop</button>
          </li>)}
        </ul>
      </div>}
      <ol className="space-y-1">
        {queued.map((it) => (
          <li key={it.bank_id} className={ROW} data-queue-row="queued" data-bank-id={it.bank_id}>
            <span className="col-start-1 row-start-1 self-start text-right text-content-subtle sm:self-center">{it.position}.</span>
            <span data-queue-cell="name" className={NAME}>{nameOf(it.bank_id)}</span>
            <span className={JOB_STATUS}>
              <span data-queue-cell="job" className={JOB}>{jobLabel(it.operation || 'pipeline')}</span>
              {it.state === 'running' ? (
                <span data-queue-cell="status" className={`${STATUS} bg-emerald-500/15 text-emerald-300`}>Running</span>
              ) : it.state === 'failed' ? (
                <span data-queue-cell="status" className={`${STATUS} bg-rose-500/15 text-rose-300`}>Failed</span>
              ) : (
                <span data-queue-cell="status" className={`${STATUS} bg-surface-raised text-content-muted`}>Waiting</span>
              )}
            </span>
            {/* Keep the top-row control before the detail-row Retry in tab order. */}
            <button type="button" onClick={() => onCancel(it.bank_id)}
              aria-label={it.state === 'running'
                ? `Stop ${nameOf(it.bank_id)} and remove it from queue`
                : `Remove ${nameOf(it.bank_id)} from queue`}
              data-queue-cell="control" className={`${CONTROL} text-content-subtle group-hover:text-content hover:text-rose-300 focus-visible:text-rose-300`}>
              ✕
            </button>
            {/* Which machine, and why it hasn't started. The snapshot has
                  published both all along and this panel dropped them: twelve
                  banks queued to a peer looked byte-identical to twelve local
                  ones, and now that two can run at once, two "running" rows
                  would be indistinguishable. `waiting_for` was read nowhere in
                  the app despite snapshot()'s own comment saying it was shown
                  here — so a queue stalled on a stuck GPU flag looked dead. */}
            {(it.device_label || (it.state !== 'running' && it.waiting_for) || it.state === 'failed') && <span className={DETAILS}>
              {it.device_label && (
                <span data-queue-private className="min-w-0 max-w-full [overflow-wrap:anywhere] rounded bg-surface-raised px-1.5 py-px text-2xs text-content-muted">
                  on {it.device_label}
                </span>
              )}
              {it.state !== 'running' && it.waiting_for && (
                <span data-queue-private className="min-w-0 max-w-full [overflow-wrap:anywhere] text-2xs text-amber-300" title={it.waiting_for}>
                  {it.waiting_for}
                </span>
              )}
              {it.state === 'failed' && it.error && (
                <span data-queue-private className="w-full [overflow-wrap:anywhere] text-xs text-rose-300">{it.error}</span>
              )}
              {it.state === 'failed' && <button type="button" onClick={() => onRetry(it.bank_id)}
                aria-label={`Retry ${nameOf(it.bank_id)}`}
                className={`${ACTION} flex-none border-indigo-400/50 text-indigo-200`}>Retry</button>}
            </span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
