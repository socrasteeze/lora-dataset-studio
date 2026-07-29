import { useCallback, useEffect, useState } from 'react'
import { apiFetch, del, postJson } from '../api/fetchClient'
import { useToast } from '../components/common/Toast'
import { useCapabilities } from '../context/CapabilitiesContext'
import { HelpBadge } from '../help/HelpMode'
import BankWorkspace from '../components/bank/BankWorkspace'
import LaunchAllDialog from '../components/bank/LaunchAllDialog'
import FolderPickerField from '../components/common/FolderPicker'
import { hiddenCount, previewSlots } from '../components/bank/bankPreview'
import { bankListSyncToast } from '../components/bank/bankSync'
import { BANK_SORTS, DEFAULT_BANK_SORT, normalizeBankSort, sortBanks } from '../components/bank/bankSort'
import { overlapNotice } from '../components/bank/bankOverlap'
import { datasetFolderNotice } from '../utils/pathRelation'
import FolderSyncNote from '../components/bank/FolderSyncNote'
import RelocateBankDialog from '../components/bank/RelocateBankDialog'
import BankScrapePanel from '../components/bank/BankScrapePanel'

const CURRENT_KEY = 'bankCurrentId'
const SORT_KEY = 'bankListSort'
// Mirrors ImageBank.name's column width (image_bank_service.BANK_NAME_MAX): the
// server refuses a longer name rather than let SQLite truncate it silently, so
// stop it here too and the user never types into a 400.
const BANK_NAME_MAX = 100

/** The bank title: click to open, ✎ to rename in place. A bank is named once, at
 * creation — often before its content is known, and the per-subfolder split names
 * them automatically — so the label has to stay editable. Only the label changes:
 * nothing about the folder or the triage moves. */
function BankTitle({ bank, onOpen, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(bank.name)
  const [saving, setSaving] = useState(false)

  const start = () => { setDraft(bank.name); setEditing(true) }
  const cancel = () => { setEditing(false); setDraft(bank.name) }
  const submit = async (e) => {
    e.preventDefault()
    const name = draft.trim()
    if (!name || name === bank.name) { cancel(); return }
    setSaving(true)
    try {
      await onRename(name)
      setEditing(false)
    } catch {
      /* onRename already told the user; stay in edit mode so the typed name
         isn't thrown away and the save can simply be retried. */
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="flex min-w-0 grow items-center gap-1">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}
          aria-label={`New name for ${bank.name}`} maxLength={BANK_NAME_MAX} autoFocus
          className="min-w-0 grow rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-content" />
        <button type="submit" disabled={saving}
          className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-emerald-300 disabled:opacity-50">
          {saving ? '…' : 'Save'}
        </button>
        <button type="button" onClick={cancel}
          className="px-1 text-xs text-content-subtle hover:text-content">Cancel</button>
      </form>
    )
  }
  return (
    <>
      <button type="button" onClick={onOpen}
        className="min-w-0 truncate text-left text-base font-semibold text-content hover:underline">
        {bank.name}
      </button>
      <button type="button" onClick={start} title="Rename this bank"
        aria-label={`Rename bank ${bank.name}`}
        className="shrink-0 px-1 text-content-subtle hover:text-content">✎</button>
    </>
  )
}

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

/** 🗃️ Image bank — triage a big unsorted folder BEFORE it becomes datasets.
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
  // The list order is a display preference, so it lives client-side and sticks
  // (a library of twenty banks is unusable in creation order — see bankSort).
  const [sort, setSort] = useState(() => {
    try { return normalizeBankSort(localStorage.getItem(SORT_KEY)) } catch { return DEFAULT_BANK_SORT }
  })
  // "One bank per subfolder": split a parent folder so each top-level subfolder
  // becomes its own bank (loose root images get their own bank too — nothing
  // dropped). A live preview shows what will be created before committing.
  const [splitMode, setSplitMode] = useState(false)
  const [includeLoose, setIncludeLoose] = useState(true)
  const [preview, setPreview] = useState(null)
  // The bank whose Launch-all dialog is open (queue or run-now from the list).
  const [dialogBankId, setDialogBankId] = useState(null)
  const [relocating, setRelocating] = useState(null)   // the bank being repointed
  // Dataset storage folders, so a folder that belongs to a dataset can be named
  // as such WHILE it is typed. The server refuses it either way — this only
  // spares the round-trip and the "why not?" (see utils/pathRelation.js).
  const [datasets, setDatasets] = useState([])

  const refresh = useCallback(async () => {
    try {
      const d = await apiFetch('/api/banks')
      setBanks(d.banks || [])
      // The server re-walked every source folder before answering: say so when
      // it found something, so the counters never move without an explanation.
      const note = bankListSyncToast(d.banks)
      if (note) toast.success(note.text)
    } catch (e) {
      toast.error(e?.message || 'Could not load the banks.')
      setBanks([])
    }
  }, [toast])

  const refreshQueue = useCallback(async () => {
    try { setQueue(await apiFetch('/api/bank-queue')) } catch { /* transient */ }
  }, [])

  useEffect(() => { if (currentId == null) refresh() }, [currentId, refresh])

  // Poll the QUEUE (a cheap in-memory snapshot) while on the list page. The bank
  // cards are deliberately NOT polled: GET /api/banks force-re-walks every source
  // folder (see refresh_banks) and toasts what it found — that is a navigation-time
  // action, not something to run every couple of seconds against a possibly
  // spun-down drive. The live "queued/running" badge is derived from this snapshot
  // instead, so it stays current for free.
  useEffect(() => {
    if (currentId != null) return undefined
    refreshQueue()
    const t = setInterval(refreshQueue, 2000)
    return () => clearInterval(t)
  }, [currentId, refreshQueue])
  // bank_id -> {state, position} from the polled queue, falling back to the
  // server's queue_state on the bank row (first paint, before the first poll).
  const queueStateOf = (bank) => {
    const it = queue?.items?.find((i) => i.bank_id === bank.id)
    return it ? { state: it.state, position: it.position } : (queue ? null : bank.queue_state)
  }

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
  // Best effort: a failed list just means no live hint, never a broken form.
  useEffect(() => {
    if (currentId != null) return undefined
    let alive = true
    apiFetch('/api/dataset/list')
      .then((d) => { if (alive) setDatasets(d.datasets || []) })
      .catch(() => { if (alive) setDatasets([]) })
    return () => { alive = false }
  }, [currentId])

  const folderNotice = datasetFolderNotice(folder, datasets)

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
    // A bank over a dataset's folder would share the dataset's LIVE files; the
    // server refuses it, and so does the form (the notice says what to do).
    if (creating || folderNotice) return
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
        // Nested folders mean two banks over the same files. Harmless while
        // triaging, destructive at Delete rejected — said once, up front.
        const overlap = overlapNotice(d.overlaps)
        if (overlap) toast.warning(overlap, 12000)
        setName(''); setFolder('')
        open(d.id)
      }
    } catch (err) {
      toast.error(err?.message || 'Could not create the bank(s).')
    } finally {
      setCreating(false)
    }
  }

  const changeSort = (id) => {
    const next = normalizeBankSort(id)
    setSort(next)
    try { localStorage.setItem(SORT_KEY, next) } catch { /* ignore */ }
  }

  // Rename in place: patch the loaded row instead of re-fetching, because GET
  // /api/banks force-re-walks every source folder (see refresh_banks) — far too
  // much work for a label change.
  const rename = async (bank, newName) => {
    try {
      const d = await postJson(`/api/bank/${bank.id}/rename`, { name: newName })
      setBanks((rows) => (rows || []).map((b) => (b.id === bank.id ? { ...b, name: d.name } : b)))
      toast.success('Bank renamed.')
    } catch (e) {
      toast.error(e?.message || 'Could not rename the bank.')
      throw e
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
      refreshQueue()
    }
  }
  const cancelQueued = async (id) => {
    try { await del(`/api/bank-queue/${id}`) } catch (e) { toast.error(e?.message || 'Could not update the queue.') }
    refreshQueue()
  }
  const clearQueue = async () => {
    try { await postJson('/api/bank-queue/clear', {}) } catch (e) { toast.error(e?.message || 'Could not clear the queue.') }
    refreshQueue()
  }

  if (currentId != null) {
    return <BankWorkspace bankId={currentId} onBack={close} onGone={close} />
  }

  const nameOf = (id) => banks?.find((b) => b.id === id)?.name || `Bank ${id}`

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        {/* Beta chip retired here — it now marks the LoRA Canvas instead. */}
        <h1 className="text-xl font-bold text-content">🗃️ Image bank</h1>
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
          <button type="submit" disabled={creating || !!folderNotice}
            title={folderNotice ? 'That folder belongs to a dataset' : undefined}
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
        {folderNotice && (
          <p role="alert"
            className="basis-full rounded-md border border-rose-500/70 bg-rose-500/15 p-3 text-sm text-rose-100">
            ⛔ {folderNotice.text}
          </p>
        )}
      </form>

      <QueuePanel queue={queue} nameOf={nameOf} onCancel={cancelQueued} onClear={clearQueue} />
      {/* Second way in: the scraper's own destination. A bank no longer needs a
          folder you prepared by hand — you can fill one straight from the web. */}
      <BankScrapePanel banks={banks} onDone={refresh} />

      {banks == null ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : banks.length === 0 ? (
        <p className="text-sm text-content-muted">
          No bank yet — create one above to start triaging a folder.
        </p>
      ) : (
        <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-content-muted">{banks.length} bank(s)</p>
          <label className="flex items-center gap-2 text-xs text-content-muted">
            Sort
            <select value={sort} onChange={(e) => changeSort(e.target.value)}
              aria-label="Sort the banks"
              className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-content">
              {BANK_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        {/* grid-cols-1 (= minmax(0,1fr)), NOT the implicit auto column: an auto
            column is sized on max-content, so the unbreakable source PATH inside
            a card stretched it past the viewport and scrolled the whole page
            sideways on a phone — with `truncate` never getting a chance to fire. */}
        <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {sortBanks(banks, sort).map((b) => {
            const qs = queueStateOf(b)
            return (
            <li key={b.id}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex min-w-0 items-center gap-2">
                <BankTitle bank={b} onOpen={() => open(b.id)}
                  onRename={(newName) => rename(b, newName)} />
                {b.activity && !b.activity.finished && (
                  <span className="text-xs text-amber-300">⏳ {b.activity.kind}…</span>
                )}
                {qs && (
                  <span className="rounded bg-indigo-500/15 px-1.5 py-px text-[10px] font-semibold text-indigo-300">
                    {qs.state === 'running' ? 'running' : `queued · #${qs.position}`}
                  </span>
                )}
                <button type="button" onClick={() => setRelocating(b)}
                  aria-label={`Move the folder of bank ${b.name}`}
                  title="Moved this folder to another disk? Point the bank at its new location."
                  className="ml-auto px-1.5 text-content-subtle hover:text-content">📦</button>
                <button type="button" onClick={() => remove(b)} aria-label={`Remove bank ${b.name}`}
                  className="px-1.5 text-content-subtle hover:text-rose-300">✕</button>
              </div>
              <p className="truncate font-mono text-xs text-content-subtle" title={b.source_path}>
                {b.source_path}
              </p>
              <BankPreviewStrip bank={b} onOpen={() => open(b.id)} />
              <p className="text-xs text-content-muted">
                {b.total} image(s) · {b.scanned} scanned · <span className="text-emerald-300">{b.keep} kept</span> · <span className="text-rose-300">{b.reject} rejected</span>
              </p>
              <FolderSyncNote sync={b.folder_sync}
                onRelocate={() => setRelocating(b)} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => open(b.id)}
                  className="rounded-md border border-border bg-surface-raised px-3 py-1 text-xs font-semibold text-content hover:bg-surface">
                  Open →
                </button>
                {!qs && (
                  <button type="button" onClick={() => setDialogBankId(b.id)} disabled={b.total === 0}
                    title="Run Launch all now, or add this bank to the queue"
                    className="rounded-md border border-border px-3 py-1 text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-raised disabled:opacity-50">
                    Launch all…
                  </button>
                )}
              </div>
            </li>
            )
          })}
        </ul>
        </div>
      )}

      {dialogBankId != null && (
        <LaunchAllDialog caps={caps} visionReady={visionReady}
          onClose={() => setDialogBankId(null)}
          onLaunch={runNow} onQueue={enqueue} />
      )}

      {relocating && (
        <RelocateBankDialog bankId={relocating.id} bankName={relocating.name}
          sourcePath={relocating.source_path}
          onClose={() => setRelocating(null)} onDone={refresh} />
      )}
    </div>
  )
}
