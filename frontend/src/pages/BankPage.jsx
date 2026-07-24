import { useCallback, useEffect, useState } from 'react'
import { apiFetch, del, postJson } from '../api/fetchClient'
import { useToast } from '../components/common/Toast'
import { useCapabilities } from '../context/CapabilitiesContext'
import { HelpBadge } from '../help/HelpMode'
import BankWorkspace from '../components/bank/BankWorkspace'
import LaunchAllDialog from '../components/bank/LaunchAllDialog'
import FolderPickerField from '../components/common/FolderPicker'
import { hiddenCount, previewSlots } from '../components/bank/bankPreview'

const CURRENT_KEY = 'bankCurrentId'

/** The card's thumbnail strip: the bank's first few images, so a list of banks
 * reads at a glance instead of as a wall of folder paths. Clicking a thumbnail
 * opens the bank, like the title and the Open button. Thumbnails are served by
 * the same route the workspace grid uses (generated on demand when the bank was
 * never scanned) and load lazily, so an off-screen card costs nothing. */
function BankPreviewStrip({ bank, onOpen }) {
  if (!bank.preview_ids?.length) return null
  const extra = hiddenCount(bank.total, bank.preview_ids)
  return (
    <div className="relative grid grid-cols-5 gap-1">
      {previewSlots(bank.preview_ids).map((id, i) => (
        <div key={id ?? `empty-${i}`}
          className="aspect-square overflow-hidden rounded border border-border bg-surface-raised">
          {id != null && (
            <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden="true"
              className="block h-full w-full">
              <img src={`/api/bank/${bank.id}/thumb/${id}`} alt="" loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                className="h-full w-full object-cover" />
            </button>
          )}
        </div>
      ))}
      {extra > 0 && (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[0.625rem] font-semibold text-white">
          +{extra}
        </span>
      )}
    </div>
  )
}

/** The cross-bank "Launch all" queue: which bank is running now and what is lined
 * up behind it. Drains one bank at a time (never a busy-GPU 503), so a user can
 * queue several banks and walk away. Each row can be cancelled; Clear all empties
 * it (and stops the running pipeline). Names are resolved from the loaded banks. */
function QueuePanel({ queue, nameOf, onCancel, onClear }) {
  if (!queue?.items?.length) return null
  return (
    <div className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-content">⏳ Launch-all queue</h2>
        <HelpBadge topic="bank-launch-queue" />
        <span className="text-xs text-content-muted">{queue.items.length} in line</span>
        <button type="button" onClick={onClear}
          className="ml-auto rounded border border-border px-2 py-0.5 text-xs text-content-muted hover:text-content hover:bg-surface-raised">
          Clear all
        </button>
      </div>
      <ol className="space-y-1">
        {queue.items.map((it) => (
          <li key={it.bank_id} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-right text-content-subtle">{it.position}.</span>
            <span className="min-w-0 truncate font-medium text-content">{nameOf(it.bank_id)}</span>
            {it.state === 'running' ? (
              <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold text-emerald-300">running</span>
            ) : (
              <span className="rounded bg-surface-raised px-1.5 py-px text-[10px] font-semibold text-content-muted">waiting</span>
            )}
            <button type="button" onClick={() => onCancel(it.bank_id)}
              aria-label={`Remove ${nameOf(it.bank_id)} from the queue`}
              className="ml-auto px-1.5 text-content-subtle hover:text-rose-300">✕</button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Image bank — triage a big unsorted folder BEFORE it becomes datasets.
 * List view (create/open/delete banks, the Launch-all queue) + per-bank
 * workspace. The bank references the folder in place: nothing is copied until
 * promotion, and the source files are never modified. */
export default function BankPage() {
  const toast = useToast()
  const { caps } = useCapabilities()
  const visionReady = !!caps?.ollama?.vision_model_ready
  const [banks, setBanks] = useState(null)
  const [queue, setQueue] = useState(null)
  const [currentId, setCurrentId] = useState(() => {
    try { return Number(localStorage.getItem(CURRENT_KEY)) || null } catch { return null }
  })
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [creating, setCreating] = useState(false)
  // "One bank per subfolder": split a parent folder so each top-level subfolder
  // becomes its own bank (loose root images get their own bank too — nothing
  // dropped). A live preview shows what will be created before committing.
  const [splitMode, setSplitMode] = useState(false)
  const [includeLoose, setIncludeLoose] = useState(true)
  const [preview, setPreview] = useState(null)
  // The bank whose Launch-all dialog is open (queue or run-now from the list).
  const [dialogBankId, setDialogBankId] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const d = await apiFetch('/api/banks')
      setBanks(d.banks || [])
    } catch (e) {
      toast.error(e?.message || 'Could not load the banks.')
      setBanks([])
    }
  }, [toast])

  const refreshQueue = useCallback(async () => {
    try { setQueue(await apiFetch('/api/bank-queue')) } catch { /* transient */ }
  }, [])

  useEffect(() => { if (currentId == null) refresh() }, [currentId, refresh])

  // Poll the queue while on the list page; also poll the bank cards (for the live
  // "running" state) only while the queue actually has something going.
  const queueActive = !!(queue && (queue.running_bank_id != null || queue.items?.length))
  useEffect(() => {
    if (currentId != null) return undefined
    refreshQueue()
    const t = setInterval(refreshQueue, 2000)
    return () => clearInterval(t)
  }, [currentId, refreshQueue])
  useEffect(() => {
    if (currentId != null || !queueActive) return undefined
    const t = setInterval(refresh, 2500)
    return () => clearInterval(t)
  }, [currentId, queueActive, refresh])

  // Live preview of the subfolder split (debounced) whenever the toggle is on.
  useEffect(() => {
    if (!splitMode || !folder.trim()) { setPreview(null); return undefined }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const d = await postJson('/api/bank/split/preview', { folder })
        if (alive) setPreview(d)
      } catch { if (alive) setPreview(null) }
    }, 400)
    return () => { alive = false; clearTimeout(t) }
  }, [splitMode, folder])

  const open = (id) => {
    try { localStorage.setItem(CURRENT_KEY, String(id)) } catch { /* ignore */ }
    setCurrentId(id)
  }
  const close = () => {
    try { localStorage.removeItem(CURRENT_KEY) } catch { /* ignore */ }
    setCurrentId(null)
  }

  const create = async (e) => {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    try {
      if (splitMode) {
        const d = await postJson('/api/bank/split', { folder, include_loose: includeLoose })
        toast.success(`${d.banks.length} bank(s) created from subfolders.`)
        setName(''); setFolder(''); setPreview(null)
        refresh()
      } else {
        const d = await postJson('/api/bank/create', { name, folder })
        toast.success(`Bank created — ${d.added} image(s) inventoried.`)
        setName(''); setFolder('')
        open(d.id)
      }
    } catch (err) {
      toast.error(err?.message || 'Could not create the bank(s).')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (bank) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remove the bank “${bank.name}”?\n\nOnly the triage data (decisions, scores, thumbnails) is deleted — the source folder and its images are NOT touched.`)) return
    try {
      await del(`/api/bank/${bank.id}`)
      toast.success('Bank removed — source folder untouched.')
      refresh()
    } catch (e) {
      toast.error(e?.message || 'Could not remove the bank.')
    }
  }

  const runNow = async (config) => {
    const id = dialogBankId
    setDialogBankId(null)
    try {
      await postJson(`/api/bank/${id}/pipeline`, config)
      toast.success('Launch all started — Stop it any time from the bank.')
      open(id)
    } catch (e) {
      toast.error(e?.message || 'Could not start Launch all.')
    }
  }
  const enqueue = async (config) => {
    const id = dialogBankId
    setDialogBankId(null)
    try {
      const d = await postJson(`/api/bank/${id}/queue`, config)
      toast.success(`Added to the queue (position ${d.position}).`)
    } catch (e) {
      toast.error(e?.message || 'Could not queue the bank.')
    } finally {
      refreshQueue(); refresh()
    }
  }
  const cancelQueued = async (id) => {
    try { await del(`/api/bank-queue/${id}`) } catch (e) { toast.error(e?.message || 'Could not update the queue.') }
    refreshQueue(); refresh()
  }
  const clearQueue = async () => {
    try { await postJson('/api/bank-queue/clear', {}) } catch (e) { toast.error(e?.message || 'Could not clear the queue.') }
    refreshQueue(); refresh()
  }

  if (currentId != null) {
    return <BankWorkspace bankId={currentId} onBack={close} onGone={close} />
  }

  const nameOf = (id) => banks?.find((b) => b.id === id)?.name || `Bank ${id}`

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-content">Image bank</h1>
        <span className="px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-500/10 text-amber-300 text-[0.625rem] font-semibold uppercase tracking-wide">Beta</span>
        <HelpBadge topic="page-bank" />
      </header>
      <p className="text-sm text-content-muted max-w-3xl">
        Point the app at a big unsorted folder (a Telegram export, a scrape dump…) and triage it
        into dataset-ready selections: a quality pass flags blur/noise/flat/small shots and groups
        near-duplicates, the face pass sorts the dump by person — then you promote the keepers
        into a dataset. The folder itself is never modified.
      </p>

      <form onSubmit={create}
        className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow min-w-40">
            <label htmlFor="bank-name" className="block text-sm font-medium text-content">Name</label>
            <input id="bank-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={splitMode ? 'Named per subfolder automatically' : 'Telegram export 07/2026'}
              required={!splitMode} disabled={splitMode}
              className="mt-1 w-full rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-content disabled:opacity-50" />
          </div>
          <div className="grow-[3] min-w-64">
            <FolderPickerField id="bank-folder" label="Folder on this computer"
              value={folder} onChange={setFolder} required
              placeholder="C:\path\to\unsorted-images (subfolders included)" />
          </div>
          <button type="submit" disabled={creating}
            className="rounded-md bg-gradient-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {creating ? 'Inventorying…' : (splitMode ? '➕ Create banks' : '➕ Create bank')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5 text-sm text-content">
            <input type="checkbox" checked={splitMode}
              onChange={(e) => setSplitMode(e.target.checked)} />
            One bank per subfolder
            <HelpBadge topic="bank-split-subfolders" />
          </label>
          {splitMode && (
            <label className="flex items-center gap-1.5 text-sm text-content-muted">
              <input type="checkbox" checked={includeLoose}
                onChange={(e) => setIncludeLoose(e.target.checked)} />
              Also make a bank from loose root images
            </label>
          )}
        </div>
        {splitMode && preview && (
          <div className="rounded-md border border-border bg-surface-raised p-3 text-sm">
            {preview.subfolders.length === 0 ? (
              <p className="text-content-muted">
                No subfolders with images here — this will create a single bank
                {preview.loose_root_count ? ` of ${preview.loose_root_count} image(s)` : ''}.
              </p>
            ) : (
              <>
                <p className="font-semibold text-content">
                  Will create {preview.subfolders.length + (includeLoose && preview.loose_root_count ? 1 : 0)} bank(s):
                </p>
                <ul className="mt-1 space-y-0.5 text-content-muted">
                  {preview.subfolders.map((s) => (
                    <li key={s.name}>• {s.name} — {s.image_count} image(s)</li>
                  ))}
                  {preview.loose_root_count > 0 && (
                    <li className={includeLoose ? '' : 'line-through opacity-60'}>
                      • (loose files) — {preview.loose_root_count} image(s)
                      {!includeLoose && ' — skipped'}
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}
      </form>

      <QueuePanel queue={queue} nameOf={nameOf} onCancel={cancelQueued} onClear={clearQueue} />

      {banks == null ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : banks.length === 0 ? (
        <p className="text-sm text-content-muted">
          No bank yet — create one above to start triaging a folder.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {banks.map((b) => (
            <li key={b.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => open(b.id)}
                  className="text-left text-base font-semibold text-content hover:underline">
                  {b.name}
                </button>
                {b.activity && !b.activity.finished && (
                  <span className="text-xs text-amber-300">{b.activity.kind}…</span>
                )}
                {b.queue_state && (
                  <span className="rounded bg-indigo-500/15 px-1.5 py-px text-[10px] font-semibold text-indigo-300">
                    {b.queue_state.state === 'running' ? 'running' : `queued · #${b.queue_state.position}`}
                  </span>
                )}
                <button type="button" onClick={() => remove(b)} aria-label={`Remove bank ${b.name}`}
                  className="ml-auto px-1.5 text-content-subtle hover:text-rose-300">✕</button>
              </div>
              <p className="truncate font-mono text-xs text-content-subtle" title={b.source_path}>
                {b.source_path}
              </p>
              <BankPreviewStrip bank={b} onOpen={() => open(b.id)} />
              <p className="text-xs text-content-muted">
                {b.total} image(s) · {b.scanned} scanned · <span className="text-emerald-300">{b.keep} kept</span> · <span className="text-rose-300">{b.reject} rejected</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => open(b.id)}
                  className="rounded-md border border-border bg-surface-raised px-3 py-1 text-xs font-semibold text-content hover:bg-surface">
                  Open →
                </button>
                {!b.queue_state && (
                  <button type="button" onClick={() => setDialogBankId(b.id)} disabled={b.total === 0}
                    title="Run Launch all now, or add this bank to the queue"
                    className="rounded-md border border-border px-3 py-1 text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-raised disabled:opacity-50">
                    🚀 Launch all…
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogBankId != null && (
        <LaunchAllDialog caps={caps} visionReady={visionReady}
          onClose={() => setDialogBankId(null)}
          onLaunch={runNow} onQueue={enqueue} />
      )}
    </div>
  )
}
