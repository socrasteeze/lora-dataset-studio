import { useState } from 'react'
import { postJson } from '../../api/fetchClient'
import { STOP_CONFIRM, stopSummary } from '../../utils/globalStop'
import GpuBusyNotice from '../common/GpuBusyNotice'

const TONE = {
  ok: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  error: 'border-red-500/50 bg-red-500/10 text-red-200',
}

const STATE_LABEL = {
  stopped: '✓ stopped',
  idle: '· nothing running',
  unconfirmed: '? not confirmed',
  failed: '✗ could not stop',
}

/** ⏹ Stop everything — the way out when something did not fire correctly.
 *
 * Deliberately reports PER TARGET. This fork refuses to let a stop answer "ok"
 * without proof — training verifies the process is dead, a generation cancel
 * names the renders it could not confirm — and a single green "done" here would
 * throw all of that away. So an unreachable ComfyUI says so, and a training run
 * that could not be confirmed dead is a failure, not a rounding error.
 */
export default function GlobalStopPanel() {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  const stop = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(STOP_CONFIRM)) return
    setBusy(true)
    setError('')
    setReport(null)
    try {
      setReport(await postJson('/api/system/stop-everything', {}))
    } catch (e) {
      setError(e.message || 'The stop request itself failed.')
    } finally {
      setBusy(false)
    }
  }

  const summary = report ? stopSummary(report) : null

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-content">Stop everything</p>
        <p className="mt-1 text-xs text-content-muted">
          Cancels queued and running bank passes, dataset batches and in-flight
          generations, asks ComfyUI to unload its models, stops training — then clears
          the GPU flags. For when something did not fire correctly and the app is stuck
          refusing with “GPU busy”. Passes that cache their progress resume where they
          stopped; anything mid-flight is lost.
        </p>
      </div>

      {/* Silent unless a flag really is stuck — and then it is the cheaper fix,
          offered first: it stops nothing. */}
      <GpuBusyNotice />

      <button type="button" onClick={stop} disabled={busy}
        className="rounded-md border border-red-500/50 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50">
        {busy ? 'Stopping…' : '⏹ Stop everything'}
      </button>

      {error && (
        <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {summary && (
        <div className={`rounded-md border p-3 space-y-2 ${TONE[summary.tone]}`}>
          <p className="text-xs font-semibold">{summary.headline}</p>
          {summary.flags && <p className="text-xs">{summary.flags}</p>}
          <ul className="space-y-1">
            {summary.targets.map((t) => (
              <li key={t.name} className="text-[0.6875rem]">
                <span className="font-medium">{t.name}</span> — {STATE_LABEL[t.state] || t.state}
                {t.detail ? `: ${t.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
