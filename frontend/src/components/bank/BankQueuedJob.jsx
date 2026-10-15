import { jobLabel } from './bankPassRun.js'

export default function BankQueuedJob({ entry, live, onCancel, onRetry }) {
  if (!entry || (entry.state === 'running' && live)) return null
  const failed = entry.state === 'failed'
  return (
    <div role="status" aria-live="polite"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-400/40 bg-indigo-500/10 p-3 text-sm">
      <div className="min-w-0 grow basis-full sm:basis-auto">
        <p className="font-semibold text-content">{jobLabel(entry.operation || 'pipeline')}</p>
        <p className="text-content-muted">{failed ? 'Failed' : entry.state === 'running'
          ? 'Starting' : `Waiting in queue · #${entry.position}`}</p>
        {failed && <p className="break-words text-rose-300">{entry.error}</p>}
      </div>
      {failed && <button type="button" onClick={onRetry}
        className="min-h-10 rounded border border-indigo-400/50 px-3 text-sm text-indigo-200">Retry</button>}
      <button type="button" onClick={onCancel}
        className="min-h-10 rounded border border-border px-3 text-sm text-content-muted">
        {failed ? 'Remove' : 'Cancel Job'}
      </button>
    </div>
  )
}
