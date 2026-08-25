import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Ban, FolderInput, Plus, X } from 'lucide-react'
import { apiFetch, del, postJson } from '../api/fetchClient'
import { useToast } from '../components/common/Toast'
import { useCapabilities } from '../context/CapabilitiesContext'
import { HelpBadge } from '../help/HelpMode'
import BankWorkspace from '../components/bank/BankWorkspace'
import LaunchAllDialog from '../components/bank/LaunchAllDialog'
import FolderPickerField from '../components/common/FolderPicker'
import GpuBusyNotice from '../components/common/GpuBusyNotice'
import { hiddenCount, previewSlots } from '../components/bank/bankPreview'
import { bankListSyncToast } from '../components/bank/bankSync'
import { BANK_SORTS, DEFAULT_BANK_SORT, bankMatches, normalizeBankSort, sortBanks } from '../components/bank/bankSort'
import { overlapNotice } from '../components/bank/bankOverlap'
import { allExcludedWarning, normalizeExcluded, splitPlan } from '../components/bank/bankSplit'
import { queueAllCandidates, queueAllConfirm, queueAllResult } from '../components/bank/bankQueueAll'
import { coverageBadges, coverageSummary } from '../components/bank/bankPassCoverage'
import { pipelineBadge, pipelineReportVerdict, queueOutcomeLine } from '../components/bank/pipelineVerdict'
import { groupRows } from '../components/bank/bankGroups'
import BankGroupCard from '../components/bank/BankGroupCard'
import BankGroupPromoteDialog from '../components/bank/BankGroupPromoteDialog'
import { datasetFolderNotice } from '../utils/pathRelation'
import FolderSyncNote from '../components/bank/FolderSyncNote'
import FolderCheckLine from '../components/bank/FolderCheckLine'
import RelocateBankDialog from '../components/bank/RelocateBankDialog'
import ForgetMissingDialog from '../components/bank/ForgetMissingDialog'
import BankScrapePanel from '../components/bank/BankScrapePanel'
import BankLaneTabs from '../components/videobank/BankLaneTabs'
import { bankListOverview } from '../components/bank/bankOverview.js'

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
      {/* The responsive probe primes the Bank workspace by clicking the first
          card's opener ([aria-label^="Open the bank"]). Rename this label and
          the probe measures an empty list and reports it clean. */}
      <button type="button" onClick={onOpen} aria-label={`Open the bank ${bank.name}`}
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
          className="aspect-[3/4] overflow-hidden rounded border border-border bg-surface-raised">
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
/** "⚠ 2 passes skipped in the last 🚀 Launch all" — or nothing at all. A clean
 *  run is deliberately silent: a green tick on every card is noise, and it makes
 *  the one card that needs attention harder to find, not easier. */
function PipelineVerdictNote({ report }) {
  const badge = pipelineBadge(pipelineReportVerdict(report))
  if (!badge) return null
  return (
    <p title={badge.title}
      className={`text-xs ${badge.tone === 'error' ? 'text-rose-300' : 'text-amber-300'}`}>
      {badge.label} in the last 🚀 Launch all — open the bank for the report.
    </p>
  )
}

/** What has actually been done to this bank, per pass. Until now the only way
 *  to find out whether a bank had ever had a face pass was to queue one and
 *  watch it — and queue-all could not be pointed at "everything not yet
 *  face-passed" because a fully triaged bank was not even eligible. A muted
 *  glyph means that pass is finished; an amber one carries what is left. */
function PassCoverageRow({ coverage }) {
  const badges = coverageBadges(coverage)
  if (!badges.length) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      title={coverageSummary(coverage)}>
      {badges.map((b) => (
        <span key={b.key} className={b.cls} title={b.title}>{b.text}</span>
      ))}
    </p>
  )
}

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
            {/* Which machine, and why it hasn't started. The snapshot has
                published both all along and this panel dropped them: twelve
                banks queued to a peer looked byte-identical to twelve local
                ones, and now that two can run at once, two "running" rows
                would be indistinguishable. `waiting_for` was read nowhere in
                the app despite snapshot()'s own comment saying it was shown
                here — so a queue stalled on a stuck GPU flag looked dead. */}
            {it.device_label && (
              <span className="truncate rounded bg-surface-raised px-1.5 py-px text-[10px] text-content-muted">
                on {it.device_label}
              </span>
            )}
            {it.state !== 'running' && it.waiting_for && (
              <span className="min-w-0 truncate text-[10px] text-amber-300" title={it.waiting_for}>
                {it.waiting_for}
              </span>
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

const BANK_STATUS_TONE = {
  keep: 'bg-emerald-400', pending: 'bg-amber-300', reject: 'bg-rose-400',
}

function BankListSummary({ bank }) {
  const summary = bankListOverview(bank)
  return (
    <div className="space-y-1.5">
      {summary.total > 0 ? (
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-raised" role="img"
          aria-label={summary.status.map((row) => `${row.label}: ${row.value}, ${row.percent}%`).join('; ')}>
          {summary.status.filter((row) => row.value > 0).map((row) => (
            <span key={row.id} className={BANK_STATUS_TONE[row.id]}
              style={{ width: `${row.widthPercent}%`, minWidth: '1px' }} />
          ))}
        </div>
      ) : summary.total === 0
        ? <p className="text-[11px] text-content-subtle">No images.</p>
        : <p className="text-[11px] text-amber-300/90">Curation totals unavailable.</p>}
      <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-content-muted">
        {summary.status.map((row) => (
          <li key={row.id} className="tabular-nums">{row.label} <span className="text-content">{row.value ?? '—'}</span>
            {row.percent != null && <span className="text-content-subtle"> · {row.percent}%</span>}</li>
        ))}
      </ul>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-content-muted">Quality</span>
        <span className={summary.scanPercent == null ? 'text-amber-300/90' : 'text-content-subtle'}>
          {summary.scanText}
        </span>
      </div>
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
  // TRANSIENT on purpose — the sort persists, this does not. Same call the
  // dataset library makes (DatasetListPanel): a filter restored on load reads
  // as "my banks are gone", which is the worst thing a library can say.
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState(() => {
    try { return normalizeBankSort(localStorage.getItem(SORT_KEY)) } catch { return DEFAULT_BANK_SORT }
  })
  // "One bank per subfolder": split a parent folder so each top-level subfolder
  // becomes its own bank (loose root images get their own bank too — nothing
  // dropped). A live preview shows what will be created before committing.
  const [splitMode, setSplitMode] = useState(false)
  const [includeLoose, setIncludeLoose] = useState(true)
  // Top-level subfolders ticked OFF for this import. Client state only: the
  // preview effect is debounced on `folder`, so sending exclusions with it
  // would mean a re-POST per checkbox and a race between what is ticked and
  // what is drawn. They ride the create call instead.
  const [excluded, setExcluded] = useState(() => new Set())
  const [preview, setPreview] = useState(null)
  // The bank whose Launch-all dialog is open (queue or run-now from the list).
  // What the Launch-all dialog is about: one bank, or every bank that still has
  // undecided images. `null` = closed.
  const [dialogScope, setDialogScope] = useState(null)
  // The group row whose ⬆ Promote dialog is open, or null.
  const [promotingGroup, setPromotingGroup] = useState(null)
  const [relocating, setRelocating] = useState(null)   // the bank being repointed
  const [forgetting, setForgetting] = useState(null)   // the bank forgetting its missing rows
  // Dataset storage folders, so a folder that belongs to a dataset can be named
  // as such WHILE it is typed. The server refuses it either way — this only
  // spares the round-trip and the "why not?" (see utils/pathRelation.js).
  const [datasets, setDatasets] = useState([])

  // ⚠️ Plain loads do NOT re-walk the source folders any more: doing that cost a
  // full disk inventory of the whole library on every navigation to this page
  // (690-1 190 ms on a real 8-bank / 86 493-image library). `rescan` is the 🔄
  // button, and it is the only caller that asks the server to walk.
  const refresh = useCallback(async ({ rescan = false } = {}) => {
    try {
      const d = await apiFetch(`/api/banks${rescan ? '?rescan=1' : ''}`)
      setBanks(d.banks || [])
      if (!rescan) return
      // A walk just happened: say what it found, so the counters never move
      // without an explanation — and say so even when it found nothing, because
      // silence after a click reads as a broken button.
      const note = bankListSyncToast(d.banks)
      if (note) toast[note.type](note.text)
      else toast.success('Source folders checked — no new image found.')
    } catch (e) {
      toast.error(e?.message || 'Could not load the banks.')
      if (!rescan) setBanks([])
    }
  }, [toast])

  const refreshQueue = useCallback(async () => {
    try { setQueue(await apiFetch('/api/bank-queue')) } catch { /* transient */ }
  }, [])
  const [rescanning, setRescanning] = useState(false)
  const rescan = async () => {
    if (rescanning) return
    setRescanning(true)
    try { await refresh({ rescan: true }) } finally { setRescanning(false) }
  }

  useEffect(() => { if (currentId == null) refresh() }, [currentId, refresh])

  // When the queue EMPTIES, say what became of the banks that drained — once,
  // not on a poll. "12 finished" alone is the sentence that let a night where
  // every GPU pass was skipped for "GPU busy" pass for a good one. This is the
  // only place the bank list is refreshed off a timer-adjacent event, and it is
  // a single refresh per drain, not a poll: GET /api/banks re-walks every source
  // folder, which must stay a navigation-time action.
  const drained = useRef([])
  useEffect(() => {
    const ids = (queue?.items || []).map((i) => i.bank_id)
    if (ids.length) { drained.current = ids; return }
    const just = drained.current
    if (!just.length) return
    drained.current = []
    ;(async () => {
      const fresh = await apiFetch('/api/banks').catch(() => null)
      const rows = fresh?.banks || []
      const line = queueOutcomeLine(
        just.map((id) => pipelineReportVerdict(
          rows.find((b) => b.id === id)?.pipeline_report)))
      if (rows.length) setBanks(rows)
      if (line) toast[/problems/.test(line) ? 'warning' : 'success'](line)
    })()
  }, [queue, toast])

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
  // A new folder has new subfolders — names ticked off the previous one would
  // silently exclude whatever happens to share a name.
  useEffect(() => { setExcluded(new Set()) }, [folder])
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

  // How many banks "Queue all" would take. Same rule the server uses
  // (banks_needing_triage), so the button's number matches what it queues.
  // Deliberately counted over ALL banks, never the filtered view: the button
  // queues what the SERVER decides, and a number that shrank when you typed
  // would be a lie about what pressing it does.
  const queueAllCount = queueAllCandidates(banks, queue).length

  // Sort first, then filter, then group — grouping LAST so a filtered pair
  // still forms its group, and a group filtered down to one member correctly
  // dissolves into a loose row (bankGroups needs 2+).
  const visibleBanks = sortBanks(banks || [], sort).filter((b) => bankMatches(b, query))

  // Computed once: the row list, the "Will create N" count and the all-excluded
  // warning are three views of the same decision.
  const splitPlanNow = splitMode && preview
    ? splitPlan({ preview, excluded, includeLoose })
    : null
  const splitWarning = allExcludedWarning(splitPlanNow, {
    loose: preview?.loose_root_count || 0, includeLoose,
  })

  const create = async (e) => {
    e.preventDefault()
    // A bank over a dataset's folder would share the dataset's LIVE files; the
    // server refuses it, and so does the form (the notice says what to do).
    if (creating || folderNotice) return
    setCreating(true)
    try {
      if (splitMode) {
        const d = await postJson('/api/bank/split',
          { folder, include_loose: includeLoose, exclude: normalizeExcluded(excluded) })
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
    if (!window.confirm(`Remove the bank “${bank.name}”?\n\nOnly the triage data (decisions, scores, thumbnails) is deleted — the source folder and its images are NOT touched.`)) return
    try {
      await del(`/api/bank/${bank.id}`)
      toast.success('Bank removed — source folder untouched.')
      refresh()
    } catch (e) {
      toast.error(e?.message || 'Could not remove the bank.')
    }
  }

  /** Rename from inside a group card, which has no in-place title editor.
   *  Renaming AWAY from the group's name leaves the group — that is the whole
   *  mechanism, and it needs no refetch because grouping is derived. */
  const renamePrompt = async (bank) => {
    // eslint-disable-next-line no-alert
    const next = window.prompt(`Rename “${bank.name}”`, bank.name)
    if (next == null || !next.trim() || next.trim() === bank.name) return
    try { await rename(bank, next.trim()) } catch { /* rename() already told them */ }
  }

  /** Opt one bank out of (or back into) name grouping. Patched in place for the
   *  same reason renames are: GET /api/banks force-re-walks every source folder,
   *  so it is not something to fire for one checkbox. */
  const keepSeparate = async (bank, value) => {
    try {
      const d = await postJson(`/api/bank/${bank.id}/keep-separate`, { keep_separate: value })
      setBanks((rows) => (rows || []).map(
        (b) => (b.id === bank.id ? { ...b, keep_separate: d.keep_separate } : b)))
    } catch (e) {
      toast.error(e?.message || 'Could not change that.')
    }
  }

  /** Queue every bank in one group — one entry each, same engine, still one
   *  bank at a time. The member list is the SERVER's (bank_groups.member_ids);
   *  a stale card must not be able to queue banks that no longer share a name. */
  const queueGroup = async (config) => {
    const lead = dialogScope?.bankId
    setDialogScope(null)
    try {
      const d = await postJson(`/api/bank-group/${lead}/queue`, config)
      toast.success(`${(d.queued || []).length} bank(s) queued — they run one at a time.`)
    } catch (e) {
      toast.error(e?.message || 'Could not queue the group.')
    } finally {
      refreshQueue()
    }
  }

  /** Every bank with undecided images, QUEUED — one entry each, never one run
   *  each. The queue drains one bank at a time behind an idle GPU, which is the
   *  whole reason this is safe as a single button; the confirm says so before
   *  anything is posted. Both dialog actions land here in the 'all' scope: with
   *  twelve banks there is no honest "run now".  */
  const queueAll = async (config) => {
    const candidates = queueAllCandidates(banks, queue)
    const confirm = queueAllConfirm(candidates, config.steps)
    if (!confirm) {
      setDialogScope(null)
      toast.info('Nothing to queue — every bank is fully triaged.')
      return
    }
    // eslint-disable-next-line no-alert
    if (!window.confirm(confirm)) return
    setDialogScope(null)
    try {
      // The toast is built from the SERVER's counts: the client's idea of what
      // is eligible can differ (a bank triaged in another tab), and a
      // disagreement must be reported rather than papered over.
      const note = queueAllResult(await postJson('/api/bank-queue/all', config))
      toast[note.type](note.text)
    } catch (e) {
      toast.error(e?.message || 'Could not queue the banks.')
    } finally {
      refreshQueue()
    }
  }

  const runNow = async (config) => {
    if (dialogScope?.kind === 'all') return queueAll(config)
    if (dialogScope?.kind === 'group') return queueGroup(config)
    const id = dialogScope?.bankId
    setDialogScope(null)
    try {
      await postJson(`/api/bank/${id}/pipeline`, config)
      toast.success('Launch all started — Stop it any time from the bank.')
      open(id)
    } catch (e) {
      toast.error(e?.message || 'Could not start Launch all.')
    }
  }
  const enqueue = async (config) => {
    if (dialogScope?.kind === 'all') return queueAll(config)
    if (dialogScope?.kind === 'group') return queueGroup(config)
    const id = dialogScope?.bankId
    setDialogScope(null)
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
      <header className="flex flex-wrap items-center gap-2">
        {/* Beta chip retired here — it now marks the LoRA Canvas instead. */}
        <h1 className="flex items-center gap-2 text-xl font-bold text-content"><Archive aria-hidden="true" className="h-5 w-5" /> Image bank</h1>
        <HelpBadge topic="page-bank" />
        {/* The kind of bank you are making, said WHERE you make one. Until now a
            .mp4 dropped in this folder was skipped in silence — this is the only
            place someone with a folder of rushes would ever have looked. */}
        <BankLaneTabs className="w-full sm:ml-auto sm:w-auto" />
      </header>

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
            <FolderPickerField id="bank-folder" label="Folder"
              value={folder} onChange={setFolder} required
              placeholder="C:\path\to\unsorted-images (subfolders included)" />
          </div>
          <button type="submit" disabled={creating || !!folderNotice}
            title={folderNotice ? 'That folder belongs to a dataset' : undefined}
            className="rounded-md bg-gradient-primary px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50">
            {creating ? 'Inventorying…' : (
              <span className="inline-flex items-center gap-1.5"><Plus aria-hidden="true" className="h-4 w-4" />
                {splitMode ? 'Create banks' : 'Create bank'}</span>
            )}
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
                  Will create {splitPlanNow.bankCount} bank(s):
                </p>
                {/* Untick a folder to leave it out of THIS import. It stays on
                    the list, struck through: a row that silently vanished would
                    be indistinguishable from one the walk never found. */}
                <ul className="mt-1 space-y-0.5 text-content-muted">
                  {splitPlanNow.rows.map((r) => (
                    <li key={r.name} className={r.excluded ? 'line-through opacity-60' : ''}>
                      {r.kind === 'loose' ? (
                        <>• {r.name} — {r.imageCount} image(s){r.excluded && ' — skipped'}</>
                      ) : (
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={!r.excluded}
                            onChange={(e) => setExcluded((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.delete(r.name)
                              else next.add(r.name)
                              return next
                            })} />
                          {r.name} — {r.imageCount} image(s){r.excluded && ' — skipped'}
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
                {splitWarning && (
                  <p className="mt-2 rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                    ⚠ {splitWarning}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {/* basis-full: its own row inside the wrapping flex form, so the sentence
            never squeezes the fields — including at 400 px. */}
        {folderNotice && (
          <p role="alert"
            className="basis-full rounded-md border border-rose-500/70 bg-rose-500/15 p-3 text-sm text-rose-100">
            <Ban aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{folderNotice.text}
          </p>
        )}
      </form>

      {/* One button for "triage everything I have". It QUEUES — one entry per
          bank, drained one at a time per machine behind an idle GPU — and the confirm says
          so, because "run all" on twelve banks is the thing to be afraid of. */}
      {queueAllCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDialogScope({ kind: 'all' })}
            title="Line every bank that still has undecided images up to run, one after another on each machine"
            className="rounded-md border border-indigo-400/50 bg-indigo-500/10 px-3 py-1.5 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/20">
            ⏳ Queue all {queueAllCount} bank(s)…
          </button>
          <span className="text-xs text-content-subtle">
            One at a time on this machine — a bank sent to another one runs alongside it.
          </span>
        </div>
      )}

      {/* A queue that drains into nothing is the loudest symptom of a leftover
          "GPU busy" flag — every bank is skipped and the night is wasted. The
          notice is silent unless the server says the flag has nothing behind it. */}
      <GpuBusyNotice onCleared={refreshQueue} />
      <QueuePanel queue={queue} nameOf={nameOf} onCancel={cancelQueued} onClear={clearQueue} />
      {/* Second way in: the scraper's own destination. A bank no longer needs a
          folder you prepared by hand — you can fill one straight from the web. */}
      <BankScrapePanel banks={banks} onDone={() => refresh()} />

      <FolderCheckLine banks={banks} busy={rescanning} onRescan={rescan} />

      {banks == null ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : banks.length === 0 ? (
        <p className="text-sm text-content-muted">
          No bank yet — create one above to start triaging a folder.
        </p>
      ) : (
        <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-content-muted">
            {visibleBanks.length === banks.length
              ? `${banks.length} bank(s)`
              : `showing ${visibleBanks.length} of ${banks.length}`}
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a bank…"
            aria-label="Find a bank"
            className="min-w-[9rem] flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-content placeholder:text-content-subtle focus:border-primary focus:outline-none sm:max-w-xs"
          />
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
        {visibleBanks.length === 0 && (
          <p className="rounded-lg border border-border bg-surface-raised px-3 py-4 text-sm text-content-muted">
            No bank matches “{query.trim()}” — clear the box to see all {banks.length}.
          </p>
        )}
        <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {/* Banks that share an EXACT name become one card. Nothing is merged:
              every image still belongs to exactly one bank, so no path resolver
              and no invariant changes — the card is a display device with
              combined counts, one queue action and one promote. A member can opt
              out ("Keep separate"), which is a property of the BANK and survives
              a rename away and back. */}
          {groupRows(visibleBanks).map((row) => {
            if (row.kind === 'group') {
              return (
                <BankGroupCard key={row.key} row={row} queueStateOf={queueStateOf}
                  onOpen={open}
                  onQueue={() => setDialogScope({ kind: 'group', bankId: row.leadId })}
                  onPromote={() => setPromotingGroup(row)}
                  onKeepSeparate={keepSeparate}
                  onRename={renamePrompt} onRelocate={setRelocating} onRemove={remove} />
              )
            }
            const b = row.bank
            const qs = queueStateOf(b)
            return (
            <li key={row.key}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex min-w-0 items-center gap-2">
                {/* Upstream's opener is a bare <button> here; this fork wraps it
                    in BankTitle, which adds the ✎ inline rename. The probe's
                    `prime` selector — [aria-label^="Open the bank"] — travels
                    with the button INTO that component, so the label is on
                    BankTitle's open button rather than on this line. */}
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
                  className="ml-auto px-1.5 text-content-subtle hover:text-content"><FolderInput aria-hidden="true" className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(b)} aria-label={`Remove bank ${b.name}`}
                  className="px-1.5 text-content-subtle hover:text-rose-300"><X aria-hidden="true" className="h-4 w-4" /></button>
              </div>
              <p className="truncate font-mono text-xs text-content-subtle" title={b.source_path}>
                {b.source_path}
              </p>
              <BankPreviewStrip bank={b} onOpen={() => open(b.id)} />
              {/* Upstream's richer bar-and-breakdown replaces the plain-text
                  count line this used to be; the two badges below carry
                  information BankListSummary does not (the last Launch-all's
                  verdict, per-pass coverage) and are kept alongside it. */}
              <BankListSummary bank={b} />
              {/* The last Launch-all's verdict, ON THE CARD. A run where every
                  GPU pass was skipped for "GPU busy" used to look identical to a
                  clean one from here — and queueing banks overnight is exactly
                  when nobody is watching. A clean run gets no badge: a tick on
                  every card makes the one amber card harder to spot. */}
              <PipelineVerdictNote report={b.pipeline_report} />
              <PassCoverageRow coverage={b.pass_coverage} />
              <FolderSyncNote sync={b.folder_sync}
                onRelocate={() => setRelocating(b)}
                onForget={() => setForgetting(b)} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => open(b.id)}
                  className="rounded-md border border-border bg-surface-raised px-3 py-1 text-xs font-semibold text-content hover:bg-surface">
                  Open →
                </button>
                {!qs && (
                  <button type="button" onClick={() => setDialogScope({ kind: 'bank', bankId: b.id })} disabled={b.total === 0}
                    title="Run Launch all now, or add this bank to the queue"
                    className="rounded-md border border-border px-3 py-1 text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-raised disabled:opacity-50">
                    Launch all
                  </button>
                )}
              </div>
            </li>
            )
          })}
        </ul>
        </div>
      )}

      {dialogScope && (
        <LaunchAllDialog caps={caps} visionReady={visionReady}
          scope={dialogScope.kind}
          onClose={() => setDialogScope(null)}
          onLaunch={runNow} onQueue={enqueue} />
      )}

      {promotingGroup && (
        <BankGroupPromoteDialog row={promotingGroup}
          onClose={() => setPromotingGroup(null)} onStarted={refresh} />
      )}

      {relocating && (
        <RelocateBankDialog bankId={relocating.id} bankName={relocating.name}
          sourcePath={relocating.source_path}
          onClose={() => setRelocating(null)} onDone={() => refresh()} />
      )}

      {forgetting && (
        <ForgetMissingDialog bankId={forgetting.id} bankName={forgetting.name}
          onClose={() => setForgetting(null)} onDone={() => refresh()} />
      )}
    </div>
  )
}
