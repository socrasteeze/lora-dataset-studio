import { useEffect, useState } from 'react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { useToast } from '../common/Toast'
import {
  PROMOTE_DESTINATIONS, canStartPromote, promoteButtonLabel, promoteSummary,
  weightNotice,
} from './bankPromote.js'
import { triggerWarning } from '../dataset/newDataset.js'

/** ⬆ Promote: copy the selection somewhere it can be worked on. THREE
 * destinations.
 *
 * • An EXISTING DATASET — the original door. Goes through the normal import path
 *   (webp normalization + perceptual dedup vs the dataset).
 * • A NEW DATASET — the same door, for a dataset that does not exist yet. It
 *   used to send the user to the Datasets page to make a blank one and back;
 *   a bank needs one field to exist and a dataset needs two, which is a reason
 *   to ask for a second field, not a reason to have no door.
 * • A NEW BANK — for isolating candidates out of a big dump (200 out of 9 000)
 *   and continuing to triage them apart, without committing them to a
 *   training container yet.
 *
 * Whichever door, the bank KEEPS its images and marks them promoted; promotion
 * copies, and two banks never share a file. Which is why the new-BANK door
 * states the measured weight before the click — images are a footnote, video is
 * not — and why neither dataset door does: those re-encode to webp on the way
 * in, so the source weight would be a checkable lie. */
export default function PromoteDialog({ bankId, bankName: sourceBankName,
  selectedIds, onClose, onStarted }) {
  const toast = useToast()
  const [destination, setDestination] = useState('dataset')
  const [datasets, setDatasets] = useState(null)
  const [datasetId, setDatasetId] = useState('')
  const [bankName, setBankName] = useState('')
  // The new-dataset door. The NAME is prefilled from the bank (harmless and
  // editable); the TRIGGER is left blank on purpose — deriving one from the name
  // would be a value the user never chose, and a silent collision with an
  // existing dataset's trigger only surfaces much later, at training-queue time.
  const [newDsName, setNewDsName] = useState(sourceBankName || '')
  const [newDsTrigger, setNewDsTrigger] = useState('')
  const [promotable, setPromotable] = useState(null)
  const [size, setSize] = useState(null)
  const [busy, setBusy] = useState(false)
  const useSelection = selectedIds.length > 0

  useEffect(() => {
    apiFetch('/api/dataset/list')
      .then((d) => setDatasets(d.datasets || []))
      .catch(() => setDatasets([]))
  }, [])

  // The kept-but-not-yet-on-THIS-dataset count is per-target (an image promoted
  // to another dataset still counts), so it can only be known once a target is
  // chosen. Fetch it then, so the copy line reflects what the server will do.
  useEffect(() => {
    if (useSelection || !datasetId) { setPromotable(null); return }
    let live = true
    setPromotable(null)
    apiFetch(`/api/bank/${bankId}/promotable?dataset_id=${Number(datasetId)}`)
      .then((d) => { if (live) setPromotable(d.count) })
      .catch(() => { if (live) setPromotable(null) })
    return () => { live = false }
  }, [bankId, datasetId, useSelection])

  // What the selection WEIGHS. Asked once, for the exact set the server would
  // copy — never estimated from an average, because the day a bank holds video
  // that average is wrong by three orders of magnitude.
  const idsKey = selectedIds.join(',')
  useEffect(() => {
    let live = true
    const qs = useSelection ? `?ids=${idsKey}` : ''
    apiFetch(`/api/bank/${bankId}/selection-size${qs}`)
      .then((d) => { if (live) setSize(d) })
      .catch(() => { if (live) setSize(null) })
    return () => { live = false }
  }, [bankId, useSelection, idsKey])

  const start = async () => {
    if (!canStartPromote({
      destination, datasetId, bankName, busy,
      datasetName: newDsName, datasetTrigger: newDsTrigger,
    })) return
    setBusy(true)
    try {
      if (destination === 'bank') {
        await postJson(`/api/bank/${bankId}/promote-to-bank`, {
          name: bankName.trim(),
          image_ids: useSelection ? selectedIds : [],
        })
        // The job runs on THIS bank (its rows are the ones being marked), so the
        // progress bar is here — say where the new bank turns up rather than
        // yanking the user off the page that is reporting the work.
        toast.success(`Copying into “${bankName.trim()}” — follow the progress bar. `
          + 'The new bank is in ← Banks once it finishes.', 9000)
      } else if (destination === 'new-dataset') {
        await postJson(`/api/bank/${bankId}/promote-to-new-dataset`, {
          name: newDsName.trim(),
          trigger_word: newDsTrigger.trim(),
          image_ids: useSelection ? selectedIds : [],
        })
        // Same reasoning as the bank branch: the job is registered on THIS bank,
        // so the progress bar is here. Landing the user on the new dataset would
        // also land them on an empty one — the import is still running.
        toast.success(`Creating “${newDsName.trim()}” and copying into it — follow `
          + 'the progress bar. The dataset is on the Datasets page once it finishes.',
        9000)
      } else {
        await postJson(`/api/bank/${bankId}/promote`, {
          dataset_id: Number(datasetId),
          image_ids: useSelection ? selectedIds : [],
        })
        toast.success('Promotion started — follow the progress bar.')
      }
      onStarted?.()
    } catch (e) {
      toast.error(e?.message || 'Promotion failed to start.')
      setBusy(false)
    }
  }

  const toBank = destination === 'bank'
  const weight = weightNotice({ destination, size })
  // 400 px is a real viewport here (the app gets consulted on a phone): the
  // destination pair stacks below sm, and the dialog scrolls rather than
  // pushing its buttons off-screen.
  const tab = (id, label) => (
    <button type="button" key={id} onClick={() => setDestination(id)}
      aria-pressed={destination === id}
      className={`flex-1 rounded-md border px-3 py-2 text-sm ${destination === id
        ? 'border-indigo-400 bg-indigo-500/20 font-semibold text-content'
        : 'border-border text-content-muted hover:bg-surface-raised'}`}>
      {label}
    </button>
  )

  return (
    <div role="dialog" aria-modal="true" aria-label="Promote the selection"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
      <div className="w-full max-w-md max-h-full overflow-y-auto rounded-xl border border-border bg-surface-overlay p-4 sm:p-5 shadow-2xl space-y-4">
        <h2 className="text-base font-bold text-content">⬆ Promote the selection</h2>

        <div>
          <p className="text-sm font-medium text-content">Send it to…</p>
          {/* Rendered FROM the constant so the two cannot drift. A grid rather
              than flex-1 in a row: three tabs at these label lengths wrap badly
              inside max-w-md, and 400 px is a real viewport here. */}
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PROMOTE_DESTINATIONS.map((d) => tab(d.id, d.label))}
          </div>
        </div>

        <p className="text-sm text-content-muted">
          {promoteSummary({
            destination, useSelection, selectedCount: selectedIds.length,
            promotable, size, datasetChosen: !!datasetId,
          })}
        </p>

        {weight && (
          <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs text-content-muted">
            💾 {weight}
          </p>
        )}

        {destination === 'new-dataset' ? (
          <div className="space-y-2">
            <div>
              <label htmlFor="promote-new-dataset-name" className="block text-sm font-medium text-content">
                Name
              </label>
              <input id="promote-new-dataset-name" type="text" value={newDsName} autoFocus
                onChange={(e) => setNewDsName(e.target.value)}
                placeholder="Emma"
                className="mt-1 w-full rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-content" />
            </div>
            <div>
              <label htmlFor="promote-new-dataset-trigger" className="block text-sm font-medium text-content">
                Trigger word
              </label>
              <input id="promote-new-dataset-trigger" type="text" value={newDsTrigger}
                onChange={(e) => setNewDsTrigger(e.target.value)}
                placeholder="zchar_emma"
                className="mt-1 w-full rounded-md border border-border bg-surface-raised px-3 py-1.5 font-mono text-sm text-content" />
              {/* Advisory, never blocking: two datasets MAY share a trigger — the
                  collision the app refuses is trigger + base model + recipe, and
                  it is only checked when training is queued. Saying it now is
                  cheap; discovering it after a LoRA is deployed is not. */}
              {triggerWarning(newDsTrigger, datasets) && (
                <p className="mt-1 text-xs text-amber-300">
                  ⚠ {triggerWarning(newDsTrigger, datasets)}
                </p>
              )}
            </div>
            <p className="text-xs text-content-subtle">
              A character dataset with the usual defaults. Concept or style, the target
              model and the fidelity all live in the dataset's own settings afterwards —
              nothing here is locked in.
            </p>
          </div>
        ) : toBank ? (
          <div>
            <label htmlFor="promote-bank-name" className="block text-sm font-medium text-content">
              Name of the new bank
            </label>
            <input id="promote-bank-name" type="text" value={bankName} autoFocus
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Candidates"
              className="mt-1 w-full rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-content" />
            <p className="mt-1 text-xs text-content-subtle">
              The copies get a folder of their own inside the app's data, so this bank and the
              new one can be curated independently — neither ever touches the other's files, nor
              your original folder.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="promote-dataset" className="block text-sm font-medium text-content">
              Target dataset
            </label>
            <select id="promote-dataset" value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-content">
              <option value="">{datasets == null ? 'Loading…' : 'Choose a dataset…'}</option>
              {(datasets || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.kind}, {d.images_total} image{d.images_total === 1 ? '' : 's'})
                </option>
              ))}
            </select>
            {datasets != null && datasets.length === 0 && (
              <p className="mt-1 text-xs text-amber-300">
                No dataset yet — pick 🆕 New dataset above to make one right here, or send
                this selection to a new image bank instead.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-content hover:bg-surface-raised">
            Cancel
          </button>
          <button type="button" onClick={start}
            disabled={!canStartPromote({
              destination, datasetId, bankName, busy,
              datasetName: newDsName, datasetTrigger: newDsTrigger,
            })}
            className="rounded-md bg-gradient-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {promoteButtonLabel({ destination, busy })}
          </button>
        </div>
      </div>
    </div>
  )
}
