import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/fetchClient'
import DiagnosticReport from '../common/DiagnosticReport'
import GlobalStopPanel from './GlobalStopPanel'
import { Card } from './primitives'
import { copyText } from '../../utils/copyText'

/* Offline maintenance is performed outside the running app. */
function UpdatesCard() {
  return (
    <Card title="Updates" help="Online update APIs are disabled in this fork.">
      <p className="text-sm text-content-muted">
        Update the checkout or replace the local release outside LDS, then restart the app.
      </p>
    </Card>
  )
}

/* Server-log viewer: tail data/app.log (fallback data/server.log) so an error
   can be copy-pasted into a bug report without hunting for files. Fetches on
   open, auto-refreshes every 5 s while open. */
function LogViewer() {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState(null)
  const [lines, setLines] = useState([])
  const load = async () => {
    try {
      const d = await apiFetch('/api/logs/tail?n=300', { background: true })
      setFile(d.file); setLines(d.lines || [])
    } catch { /* viewer is best-effort */ }
  }
  useEffect(() => {
    if (!open) return undefined
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [open])
  const [copyFailed, setCopyFailed] = useState(false)
  const copy = async () => {
    const res = await copyText(lines.join('\n'))
    if (!res.ok) { setCopyFailed(true); setTimeout(() => setCopyFailed(false), 2500) }
  }
  return (
    <section className="lds-section py-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center gap-2 text-left">
        <h2 className="text-base font-semibold text-content">🪵 Server log</h2>
        <span className="text-xs text-content-subtle">
          {open ? (file ? `data/${file} — last ${lines.length} lines, refreshes every 5 s` : 'no log file yet')
            : 'something failed? open this and copy the log into your bug report'}
        </span>
        <span aria-hidden className="ml-auto text-content-subtle">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button type="button" onClick={load}
              className="rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs text-content">
              ↻ Refresh
            </button>
            <button type="button" onClick={copy} disabled={!lines.length}
              className="rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs text-content disabled:opacity-40">
              {copyFailed ? 'Copy failed — select the log below' : '📋 Copy all'}
            </button>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-app/60 p-2 text-2xs leading-snug text-content-muted">
            {lines.length ? lines.join('\n') : 'Log is empty.'}
          </pre>
        </div>
      )}
    </section>
  )
}

/* Maintenance keeps what is about the APP itself — updating it, reporting a bug,
   reading its log. Everything about the disk (trash, archive, dataset root, where
   the big folders live) moved to Settings › Storage, where those questions are
   answered together instead of one card per screen. */
export default function MaintenanceSection() {
  return (
    <div className="space-y-4">
      <UpdatesCard />
      <GlobalStopPanel />
      <DiagnosticReport />
      <LogViewer />
    </div>
  )
}
