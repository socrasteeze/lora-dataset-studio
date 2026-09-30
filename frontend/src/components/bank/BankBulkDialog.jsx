import { useEffect, useMemo, useRef, useState } from 'react'
import { postJson } from '../../api/fetchClient'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { bankSelectionKey, buildBulkEditItems, successfulBulkKeys, transformBankName } from './bankBulk.js'

const CLOSE_WARNING = 'Discard the unsaved bulk bank changes?'

export default function BankBulkDialog({ banks, onClose, onResults }) {
  const dialogRef = useRef(null)
  const [pending, setPending] = useState(banks)
  const [drafts, setDrafts] = useState(() => Object.fromEntries(
    banks.map((bank) => [bankSelectionKey(bank), bank.name])))
  const [grouping, setGrouping] = useState('unchanged')
  const [tools, setTools] = useState({ find: '', replace: '', prefix: '', suffix: '' })
  const [outcomes, setOutcomes] = useState([])
  const [busy, setBusy] = useState(false)
  const [submittedPayload, setSubmittedPayload] = useState(null)
  const [networkUnknown, setNetworkUnknown] = useState(false)
  const dirtyRef = useRef(false)
  const busyRef = useRef(false)
  const navigationAllowedRef = useRef(false)
  useFocusTrap(dialogRef, true)

  const payload = useMemo(() => ({ banks: buildBulkEditItems(pending, drafts, grouping) }),
    [pending, drafts, grouping])
  const invalidNames = pending.filter((bank) => {
    const name = String(drafts[bankSelectionKey(bank)] ?? '').trim()
    return !name || name.length > 100
  })
  const dirty = grouping !== 'unchanged'
    || Object.keys(tools).some((key) => tools[key])
    || pending.some((bank) => drafts[bankSelectionKey(bank)] !== bank.name)
    || outcomes.length > 0 || networkUnknown
  dirtyRef.current = dirty
  busyRef.current = busy

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const entryUrl = window.location.href
    document.body.style.overflow = 'hidden'
    const guardNavigation = (event) => {
      if (navigationAllowedRef.current) return
      if (!busyRef.current && (!dirtyRef.current || window.confirm(CLOSE_WARNING))) {
        navigationAllowedRef.current = true
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      // HashRouter has already received the rejected location by the time a
      // window listener runs. Restore the URL AND publish that restored history
      // state before React commits the rejected route. The short bypass also
      // consumes the paired hashchange without a second confirmation.
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
    if (!dirty && !busy) return undefined
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, busy])

  const requestClose = () => {
    if (busy) return
    if (dirty && !window.confirm(CLOSE_WARNING)) return
    onClose()
  }

  useEffect(() => {
    const keydown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      requestClose()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const setDraft = (bank, value) => {
    setDrafts((prev) => ({ ...prev, [bankSelectionKey(bank)]: value }))
    setSubmittedPayload(null); setNetworkUnknown(false)
  }
  const updateTools = (key, value) => {
    setTools((prev) => ({ ...prev, [key]: value }))
    setSubmittedPayload(null); setNetworkUnknown(false)
  }
  const applyPreview = () => {
    setDrafts((prev) => Object.fromEntries(pending.map((bank) => {
      const key = bankSelectionKey(bank)
      return [key, transformBankName(prev[key], tools)]
    })))
    setTools({ find: '', replace: '', prefix: '', suffix: '' })
    setSubmittedPayload(null); setNetworkUnknown(false)
  }

  const save = async () => {
    if (busy) return
    const exactPayload = submittedPayload || payload
    if (!exactPayload.banks.length) return
    setBusy(true); setOutcomes([])
    try {
      const response = await postJson('/api/banks/bulk-edit', exactPayload)
      const results = response.results || []
      const succeeded = successfulBulkKeys(results)
      onResults(results)
      setPending((rows) => rows.filter((bank) => !succeeded.has(bankSelectionKey(bank))))
      setOutcomes(results)
      setSubmittedPayload(null); setNetworkUnknown(false)
      if (response.failed === 0) onClose()
    } catch (error) {
      setSubmittedPayload(exactPayload)
      setNetworkUnknown(error?.message === 'Network error')
      setOutcomes(exactPayload.banks.map((bank) => ({ ...bank, ok: false, error: error?.message || 'Save failed.' })))
    } finally { setBusy(false) }
  }

  return (
    <div data-probe-layer className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bank-bulk-title"
        data-probe-chrome="bank-bulk-dialog" data-probe-layer
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border p-4">
          <div className="min-w-0 grow">
            <h2 id="bank-bulk-title" className="text-lg font-semibold text-content">Edit Banks</h2>
            <p className="text-xs text-content-muted">{pending.length} bank(s) remain in this operation.</p>
          </div>
          <button type="button" onClick={requestClose} disabled={busy} aria-label="Close Edit Banks"
            className="min-h-10 min-w-10 rounded-md border border-border text-content-muted hover:text-content disabled:opacity-50">✕</button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-content">Name Tools</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-content-muted">Find
                <input value={tools.find} disabled={busy} onChange={(e) => updateTools('find', e.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-content" />
              </label>
              <label className="text-xs text-content-muted">Replace
                <input value={tools.replace} disabled={busy} onChange={(e) => updateTools('replace', e.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-content" />
              </label>
              <label className="text-xs text-content-muted">Prefix
                <input value={tools.prefix} disabled={busy} onChange={(e) => updateTools('prefix', e.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-content" />
              </label>
              <label className="text-xs text-content-muted">Suffix
                <input value={tools.suffix} disabled={busy} onChange={(e) => updateTools('suffix', e.target.value)}
                  className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-content" />
              </label>
            </div>
            <p className="text-xs text-content-subtle">Find uses literal text. Preview: {pending[0]
              ? transformBankName(drafts[bankSelectionKey(pending[0])], tools) : 'No bank remains'}</p>
            <button type="button" onClick={applyPreview} disabled={busy || !Object.values(tools).some(Boolean)}
              className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold text-content disabled:opacity-50">Apply to Names</button>
          </fieldset>

          <label className="block text-sm font-semibold text-content">Grouping
            <select aria-label="Grouping" value={grouping} disabled={busy} onChange={(e) => { setGrouping(e.target.value); setSubmittedPayload(null); setNetworkUnknown(false) }}
              className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-content">
              <option value="unchanged">Unchanged</option>
              <option value="separate">Keep Separate</option>
              <option value="group">Group by Name</option>
            </select>
          </label>

          <div className="space-y-2">
            {pending.map((bank) => (
              <div key={bankSelectionKey(bank)} className="min-w-0">
                <label className="block text-xs text-content-muted">{bank.name}
                  <input value={drafts[bankSelectionKey(bank)] ?? ''} maxLength={100} disabled={busy}
                    onChange={(e) => setDraft(bank, e.target.value)} aria-label={`Name for ${bank.name}`}
                    className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-content" />
                </label>
                <p className="mt-1 break-all font-mono text-2xs text-content-subtle">{bank.source_path}</p>
              </div>
            ))}
          </div>

          {invalidNames.length > 0 && (
            <p role="alert" className="text-xs text-rose-300">
              {invalidNames.length} name(s) are empty or longer than 100 characters.
            </p>
          )}

          {networkUnknown && (
            <p role="alert" className="rounded-md border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-200">
              The connection failed after submission. The result is unknown. Retry sends the exact same names and grouping values.
            </p>
          )}
          {outcomes.some((row) => !row.ok) && (
            <ul className="space-y-1 text-xs" aria-label="Bulk edit results">
              {outcomes.map((row) => (
                <li key={`${row.id}:${row.instance_id}`} className={row.ok ? 'text-emerald-300' : 'text-rose-300'}>
                  Bank {row.id}: {row.ok ? 'Saved' : (row.error || `Failed (${row.status || 'unknown'})`)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-border p-4">
          <button type="button" onClick={requestClose} disabled={busy}
            className="min-h-10 min-w-0 rounded-md border border-border px-2 text-sm font-semibold text-content disabled:opacity-50">Cancel</button>
          <button type="button" onClick={save} disabled={busy || invalidNames.length > 0 || !(submittedPayload || payload).banks.length}
            className="min-h-10 min-w-0 rounded-md bg-gradient-primary px-2 text-sm font-semibold text-gray-950 disabled:opacity-50">
            {busy ? 'Saving…' : networkUnknown ? 'Retry Exact Changes' : 'Save Changes'}
          </button>
        </footer>
      </section>
    </div>
  )
}
