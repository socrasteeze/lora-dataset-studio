import { useEffect, useState } from 'react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { useToast } from '../common/Toast'

/** ⬆ Promote a whole NAME GROUP into one dataset.
 *
 * Its own dialog rather than a mode threaded through PromoteDialog: that one is
 * bank-scoped and offers a second destination (a new bank) plus a grid
 * selection, neither of which a group card has. Bolting a third shape onto it
 * would make every branch of the bank-scoped dialog conditional on something it
 * otherwise never thinks about.
 *
 * There is deliberately no image picker: a group card has no grid, so this is
 * "everything kept in these banks that is not already in the dataset". The
 * members are walked one after another into the same dataset, and two banks
 * holding the same photo cost one dataset image — the import dedupes.
 */
export default function BankGroupPromoteDialog({ row, onClose, onStarted }) {
  const toast = useToast()
  const [datasets, setDatasets] = useState(null)
  const [datasetId, setDatasetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/dataset/list')
      .then((d) => setDatasets(d.datasets || []))
      .catch(() => setDatasets([]))
  }, [])

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      await postJson(`/api/bank-group/${row.leadId}/promote`,
        { dataset_id: Number(datasetId) })
      toast.success(`Promoting ${row.members.length} bank(s) into the dataset — `
        + 'watch the first bank for progress.')
      onStarted?.()
      onClose?.()
    } catch (e) {
      // Kept open with the choice intact: the usual refusal is "a pass is
      // running on one of these banks", which is fixed and retried, not
      // restarted from an empty dialog.
      setError(e?.message || 'Could not start the promotion.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Promote the group into a dataset"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface-overlay p-4 shadow-2xl space-y-3 sm:p-5">
        <div>
          <h2 className="text-base font-bold text-content">⬆ Promote “{row.name}”</h2>
          <p className="mt-1 text-sm text-content-muted">
            Every kept image across the {row.members.length} banks in this group goes
            into one dataset — {row.keep} kept in total. The banks keep their images;
            promotion copies. Images held by more than one of them are imported once.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-content">Dataset</span>
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-content">
            <option value="">Choose a dataset…</option>
            {(datasets || []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>

        {datasets && datasets.length === 0 && (
          <p className="text-xs text-content-muted">
            No dataset yet — create one first, then come back.
          </p>
        )}

        {error && (
          <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-content-muted hover:text-content hover:bg-surface-raised disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={start} disabled={busy || !datasetId || row.keep === 0}
            className="rounded-md bg-gradient-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Starting…' : `⬆ Promote ${row.keep} image(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
