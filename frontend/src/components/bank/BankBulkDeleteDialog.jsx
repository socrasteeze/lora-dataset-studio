import { useEffect, useRef, useState } from 'react'
import { postJson } from '../../api/fetchClient'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { bankSelectionKey, successfulBulkKeys } from './bankBulk.js'

export default function BankBulkDeleteDialog({ banks, onClose, onResults }) {
  const ref = useRef(null)
  const [pending, setPending] = useState(banks)
  const [busy, setBusy] = useState(false)
  const [outcomes, setOutcomes] = useState([])
  const [submittedPayload, setSubmittedPayload] = useState(null)
  const [networkUnknown, setNetworkUnknown] = useState(false)
  const busyRef = useRef(false)
  const outcomesRef = useRef([])
  const navigationAllowedRef = useRef(false)
  useFocusTrap(ref, true)
  busyRef.current = busy
  outcomesRef.current = outcomes
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const entryUrl = window.location.href
    document.body.style.overflow = 'hidden'
    const guardNavigation = (event) => {
      if (navigationAllowedRef.current) return
      if (!busyRef.current && (!outcomesRef.current.length
        || window.confirm('Discard these bulk delete results?'))) {
        navigationAllowedRef.current = true
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      navigationAllowedRef.current = true
      history.pushState(null, '', entryUrl)
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
      setTimeout(() => { navigationAllowedRef.current = false }, 0)
    }
    window.addEventListener('popstate', guardNavigation, true)
    window.addEventListener('hashchange', guardNavigation, true)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('popstate', guardNavigation, true)
      window.removeEventListener('hashchange', guardNavigation, true)
    }
  }, [])
  useEffect(() => {
    if (!outcomes.length && !busy) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [outcomes.length, busy])
  const payload = submittedPayload || { banks: pending.map((bank) => ({ id: Number(bank.id), instance_id: String(bank.instance_id) })) }

  const requestClose = () => {
    if (busy) return
    if (outcomes.length && !window.confirm('Discard these bulk delete results?')) return
    onClose()
  }

  useEffect(() => {
    const escape = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      requestClose()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  })

  const remove = async () => {
    if (busy || !payload.banks.length) return
    setBusy(true); setOutcomes([])
    try {
      const response = await postJson('/api/banks/bulk-delete', payload)
      const results = response.results || []
      const succeeded = successfulBulkKeys(results)
      onResults(results)
      setPending((rows) => rows.filter((bank) => !succeeded.has(bankSelectionKey(bank))))
      setOutcomes(results); setSubmittedPayload(null); setNetworkUnknown(false)
      if (response.failed === 0) onClose()
    } catch (error) {
      setSubmittedPayload(payload)
      setNetworkUnknown(error?.message === 'Network error')
      setOutcomes(payload.banks.map((bank) => ({ ...bank, ok: false, error: error?.message || 'Delete failed.' })))
    } finally { setBusy(false) }
  }

  return (
    <div data-probe-layer className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="bank-bulk-delete-title"
        data-probe-chrome="bank-bulk-dialog" data-probe-layer
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-rose-500/60 bg-surface-overlay shadow-2xl">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <h2 id="bank-bulk-delete-title" className="text-lg font-semibold text-content">Delete {pending.length} Bank(s)?</h2>
          <p className="rounded-md border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-100">
            This removes triage records, decisions, and caches. Trash does not restore that data. External source files stay. App-managed imported copies go to Trash.
          </p>
          <ul className="space-y-2 text-sm text-content-muted">
            {pending.map((bank) => (
              <li key={bankSelectionKey(bank)} className="min-w-0">
                <span className="font-semibold text-content">{bank.name}</span>
                <span className="block break-all font-mono text-2xs text-content-subtle">{bank.source_path}</span>
              </li>
            ))}
          </ul>
          {networkUnknown && <p role="alert" className="text-sm text-amber-200">The result is unknown. Retry sends the exact same bank identities.</p>}
          {outcomes.some((row) => !row.ok) && (
            <ul className="space-y-1 text-xs" aria-label="Bulk delete results">
              {outcomes.map((row) => <li key={`${row.id}:${row.instance_id}`} className={row.ok ? 'text-emerald-300' : 'text-rose-300'}>
                Bank {row.id}: {row.ok ? 'Deleted' : (row.error || `Failed (${row.status || 'unknown'})`)}</li>)}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
          <button type="button" onClick={requestClose} disabled={busy}
            className="min-h-10 min-w-0 rounded-md border border-border px-2 text-sm font-semibold text-content disabled:opacity-50">Cancel</button>
          <button type="button" onClick={remove} disabled={busy || !payload.banks.length}
            className="min-h-10 min-w-0 rounded-md bg-rose-600 px-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Deleting…' : networkUnknown ? 'Retry Exact Delete' : 'Delete Banks'}
          </button>
        </div>
      </section>
    </div>
  )
}
