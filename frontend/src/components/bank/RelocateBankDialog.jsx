import { useState } from 'react'
import { postJson } from '../../api/fetchClient'
import { useToast } from '../common/Toast'
import FolderPickerField from '../common/FolderPicker'
import {
  relocationApplyLabel, relocationDoneText, relocationPreviewMatches,
  relocationReady, relocationSummary,
} from './bankRelocate'

/** Check file counts before repointing or widening a bank. */
export default function RelocateBankDialog({ bankId, bankName, sourcePath, onClose, onDone }) {
  const toast = useToast()
  const [folder, setFolder] = useState(sourcePath || '')
  const [preview, setPreview] = useState(null)
  // The string actually SENT to the server, kept so the answer can be tied
  // back to it — the answer itself comes back normalised (see
  // relocationPreviewMatches).
  const [checkedFor, setCheckedFor] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // The server resolved the path; show the user what it settled on rather than
  // leaving their quoted paste in the field pretending nothing happened.
  const adopt = (d) => { if (d?.folder) setFolder(d.folder) }

  const call = async (confirm) => {
    const typed = folder.trim()
    if (busy || !typed) return null
    setBusy(true)
    setError(null)
    setCheckedFor(typed)
    try {
      return await postJson(`/api/bank/${bankId}/relocate`,
        { folder: typed, confirm })
    } catch (e) {
      // A mismatch comes back as a 400 WITH the counts, so the same verdict
      // block explains it instead of a bare error line.
      if (e?.body && Number(e.body.total) >= 0 && e.body.found != null) {
        setPreview(e.body)
        adopt(e.body)
      } else {
        setError(e?.message || 'Could not check that folder.')
        setPreview(null)
      }
      return null
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    const d = await call(false)
    if (d) { setPreview(d); adopt(d) }
  }

  const apply = async () => {
    const d = await call(true)
    if (!d) return
    toast.success(relocationDoneText(d))
    onDone?.(d)
    onClose?.()
  }

  const summary = relocationSummary(preview)
  const current = relocationPreviewMatches(preview, folder, checkedFor)
  const ready = relocationReady(preview, folder, checkedFor)
  const tone = {
    ok: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
    warn: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
    error: 'border-rose-500/60 bg-rose-500/10 text-rose-200',
  }[summary?.tone] || ''

  return (
    <div role="dialog" aria-modal="true" aria-label="Move folder"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface-overlay p-4 sm:p-5 shadow-2xl space-y-4">
        <h2 className="text-base font-bold text-content">📦 Move folder</h2>
        <p className="text-sm text-content-muted">
          {bankName}. Scores and decisions stay.
        </p>
        <p className="text-xs text-content-subtle">
          Currently:{' '}
          <span className="font-mono text-content-muted break-all">{sourcePath}</span>
        </p>
        <FolderPickerField id={`relocate-folder-${bankId}`} label="New Folder"
          value={folder}
          onChange={(v) => { setFolder(v); setPreview(null); setCheckedFor(null) }}
          hint="Choose the moved folder or a parent of the current folder." />

        {error && (
          <p className="rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        {summary && current && (
          <div className={`rounded-md border px-3 py-2 text-sm space-y-1 ${tone}`}>
            <p className="font-semibold">{summary.headline}</p>
            <p className="break-words opacity-90">{summary.detail}</p>
            {preview.overlaps?.length > 0 && (
              <p className="break-words">Overlapping banks include {preview.overlaps.map((bank) => bank.name).join(', ')}.</p>
            )}
            {preview.missing_sample?.length > 0 && (
              <ul className="mt-1 space-y-0.5 font-mono text-xs opacity-80">
                {preview.missing_sample.map((rel) => (
                  <li key={rel} className="break-all">· {rel}</li>
                ))}
                {preview.missing > preview.missing_sample.length && (
                  <li>· and {preview.missing - preview.missing_sample.length} more</li>
                )}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} autoFocus
            className="rounded-md border border-border px-3 py-1.5 text-sm text-content hover:bg-surface-raised">
            Cancel
          </button>
          <button type="button" onClick={check} disabled={busy || !folder.trim()}
            className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm font-semibold text-content hover:bg-surface disabled:opacity-40">
            {busy && !ready ? 'Checking' : '🔍 Check folder'}
          </button>
          <button type="button" onClick={apply} disabled={busy || !ready}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-gray-950 hover:bg-indigo-500 disabled:opacity-40">
            {relocationApplyLabel(preview)}
          </button>
        </div>
      </div>
    </div>
  )
}
