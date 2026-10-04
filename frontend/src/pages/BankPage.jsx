import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Ban, FolderInput, Plus, X } from 'lucide-react'
import { apiFetch, del, postJson } from '../api/fetchClient'
import { useToast } from '../components/common/Toast'
import { useCapabilities } from '../context/CapabilitiesContext'
import { HelpBadge } from '../help/HelpMode'
import BankWorkspace from '../components/bank/BankWorkspace'
import LaunchAllDialog from '../components/bank/LaunchAllDialog'
import FolderPickerField from '../components/common/FolderPicker'
import { Button, Input, Select, btnClass } from '../components/common/Controls.jsx'
import Pagination from '../components/common/Pagination.jsx'
import { libraryPageFor, normalizePageSize } from '../utils/datasetLibrary.js'
import GpuBusyNotice from '../components/common/GpuBusyNotice'
import { hiddenCount, previewSlots } from '../components/bank/bankPreview'
import { bankListSyncToast } from '../components/bank/bankSync'
import { BANK_SORTS, DEFAULT_BANK_SORT, bankMatches, normalizeBankSort, sortBanks } from '../components/bank/bankSort'
import { overlapNotice } from '../components/bank/bankOverlap'
import { allExcludedWarning, normalizeExcluded, splitPlan } from '../components/bank/bankSplit'
import { queueAllCandidates, queueAllConfirm, queueAllResult } from '../components/bank/bankQueueAll'
import BankQueuePanel from '../components/bank/BankQueuePanel'
import { clearWaitingConfirm, removeQueuedConfirm, runningItems, stopRunningConfirm } from '../components/bank/bankQueueActions.js'
import { coverageBadges, coverageSummary } from '../components/bank/bankPassCoverage'
import { pipelineBadge, pipelineReportVerdict, queueOutcomeLine } from '../components/bank/pipelineVerdict'
import { composeBankList } from '../components/bank/bankListCompose.js'
import BankGroupCard from '../components/bank/BankGroupCard'
import BankGroupPromoteDialog from '../components/bank/BankGroupPromoteDialog'
import { datasetFolderNotice } from '../utils/pathRelation'
import FolderSyncNote from '../components/bank/FolderSyncNote'
import FolderCheckLine from '../components/bank/FolderCheckLine'
import RelocateBankDialog from '../components/bank/RelocateBankDialog'
import ForgetMissingDialog from '../components/bank/ForgetMissingDialog'
import PluginSlot from '../plugins/PluginSlot.jsx'
import BankLaneTabs from '../components/bank/BankLaneTabs'
import { bankListOverview, bankListSummaryLine } from '../components/bank/bankOverview.js'
import BankBulkDialog from '../components/bank/BankBulkDialog.jsx'
import BankBulkDeleteDialog from '../components/bank/BankBulkDeleteDialog.jsx'
import { BANK_BULK_LIMIT, bankSelectionKey, bulkSelectionNote, selectVisibleBanks, successfulBulkKeys } from '../components/bank/bankBulk.js'

const CURRENT_KEY = 'bankCurrentId'
const SORT_KEY = 'bankListSort'
const PAGE_SIZE_KEY = 'bankListPageSize'
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
        <Input size="sm" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}
          aria-label={`New name for ${bank.name}`} maxLength={BANK_NAME_MAX} autoFocus
          className="min-w-0 grow bg-surface-raised" />
        <Button type="submit" size="sm" noShrink disabled={saving}
          className="font-semibold text-emerald-300">
          {saving ? '' : 'Save'}
        </Button>
        <Button type="button" size="sm" noShrink variant="ghost" onClick={cancel}>Cancel</Button>
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
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-2xs font-semibold text-white">
          +{extra}
        </span>
      )}
    </div>
  )
}

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

const BANK_STATUS_TONE = {
  keep: 'bg-emerald-400', pending: 'bg-amber-300', reject: 'bg-rose-400',
}

function BankListSummary({ bank }) {
  const summary = bankListOverview(bank)
  const line = bankListSummaryLine(bank)
  return (
    <div className="space-y-1.5">
      {summary.total > 0 && (
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-raised" role="img"
          aria-label={summary.status.map((row) => `${row.label}: ${row.value}, ${row.percent}%`).join('; ')}>
          {summary.status.filter((row) => row.value > 0).map((row) => (
            <span key={row.id} className={BANK_STATUS_TONE[row.id]}
              style={{ width: `${row.widthPercent}%`, minWidth: '1px' }} />
          ))}
        </div>
      )}
      <p className={`text-2xs ${summary.total == null ? 'text-amber-300/90' : 'text-content-muted'}`}>
        {line}
      </p>
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
  const [pageSize, setPageSize] = useState(() => {
    try { return normalizePageSize(localStorage.getItem(PAGE_SIZE_KEY)) } catch { return 24 }
  })
  const [page, setPage] = useState(1)
  const [appliedList, setAppliedList] = useState({ query: '', sort })
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
  const [selectingBanks, setSelectingBanks] = useState(false)
  const [selectedBanks, setSelectedBanks] = useState(() => new Set())
  const [bulkDialog, setBulkDialog] = useState(null)

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
  useEffect(() => {
    try { localStorage.setItem(PAGE_SIZE_KEY, String(pageSize)) } catch { /* ignore */ }
  }, [pageSize])

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

  // Sort, then filter, then group the full filtered list, then page the display
  // rows. A page slice before grouping would sum only the banks on that page.
  // A name the search leaves as one bank stays a loose row. Selection mode
  // pages the raw filtered banks instead, so Select Visible stays per bank.
  const visibleBanks = sortBanks(banks || [], sort).filter((b) => bankMatches(b, query))
  const viewPage = libraryPageFor(page, { query, sort }, appliedList)
  if (viewPage !== page || appliedList.query !== query || appliedList.sort !== sort) {
    setAppliedList({ query, sort })
    if (viewPage !== page) setPage(viewPage)
  }
  const { paged, rows: listRows } = composeBankList(visibleBanks, {
    selecting: selectingBanks,
    page: viewPage,
    pageSize,
  })
  const selectedBankRows = (banks || []).filter((bank) => selectedBanks.has(bankSelectionKey(bank)))
  const visibleSelectedCount = visibleBanks.filter((bank) => selectedBanks.has(bankSelectionKey(bank))).length
  const hiddenSelectedCount = selectedBankRows.length - visibleSelectedCount

  const toggleBankSelection = (bank) => {
    if (!bank.instance_id) {
      toast.error('This bank has no stable instance identity. Refresh the list before selection.')
      return
    }
    const key = bankSelectionKey(bank)
    setSelectedBanks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < BANK_BULK_LIMIT) next.add(key)
      else toast.warning(`You can select up to ${BANK_BULK_LIMIT} banks.`)
      return next
    })
  }

  const applyBulkResults = (results, deleting = false) => {
    const succeeded = successfulBulkKeys(results)
    if (!succeeded.size) return
    setSelectedBanks((prev) => new Set([...prev].filter((key) => !succeeded.has(key))))
    setBanks((rows) => deleting
      ? (rows || []).filter((bank) => !succeeded.has(bankSelectionKey(bank)))
      : (rows || []).map((bank) => {
        const result = results.find((row) => row.ok
          && Number(row.id) === Number(bank.id) && String(row.instance_id) === String(bank.instance_id))
        return result ? { ...bank,
          ...(result.name != null ? { name: result.name } : {}),
          ...(result.keep_separate != null ? { keep_separate: result.keep_separate } : {}),
        } : bank
      }))
  }

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
        // A subfolder that was ALREADY a bank is refreshed, not registered
        // again — say so, or the count reads as "it did less than I asked".
        const reused = (d.banks || []).filter((b) => b.reused).length
        const made = (d.banks || []).length - reused
        toast.success(reused
          ? `${made} bank(s) created, ${reused} already existed and were refreshed.`
          : `${made} bank(s) created from subfolders.`)
        setName(''); setFolder(''); setPreview(null)
        refresh()
      } else {
        const d = await postJson('/api/bank/create', { name, folder })
        // One folder is one bank. Re-adding it refreshes the bank that already
        // owns it — `added: 0` alone would read as a failed import.
        toast.success(d.reused
          ? `That folder is already the bank “${d.name}” — refreshed, ${d.added} new image(s).`
          : `Bank created — ${d.added} image(s) inventoried.`)
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
  const nameOf = (id) => banks?.find((b) => b.id === id)?.name || `Bank ${id}`

  // The ✕ on a waiting row is one tap. On the RUNNING row it stops a run, so it
  // asks first — the same question Stop running asks (bankQueueActions.js).
  const cancelQueued = async (id) => {
    // The panel polls every 2 s. A waiting row can become the running row in
    // that gap, and the confirm has to ask the running-row question when it has.
    let live = queue
    try {
      live = await apiFetch('/api/bank-queue')
      setQueue(live)
    } catch { /* the polled snapshot is the best confirm we have */ }
    const ask = removeQueuedConfirm(live, nameOf, id)
    if (ask && !window.confirm(ask)) return
    try { await del(`/api/bank-queue/${id}`) } catch (e) { toast.error(e?.message || 'Could not update the queue.') }
    refreshQueue()
  }
  // Clear waiting leaves the running bank alone: pending_only tells the server
  // so. Without it the route still empties everything, for an older tab.
  const clearWaiting = async () => {
    const ask = clearWaitingConfirm(queue)
    if (!ask || !window.confirm(ask)) return
    try { await postJson('/api/bank-queue/clear', { pending_only: true }) } catch (e) { toast.error(e?.message || 'Could not clear the queue.') }
    refreshQueue()
  }
  // One entry runs per machine, so there can be more than one to stop. Each is
  // the same per-entry cancel the ✕ uses; the next waiting bank then starts.
  const stopRunning = async () => {
    const ask = stopRunningConfirm(queue, nameOf)
    if (!ask || !window.confirm(ask)) return
    for (const it of runningItems(queue)) {
      try { await del(`/api/bank-queue/${it.bank_id}`) } catch (e) { toast.error(e?.message || 'Could not stop the bank.') }
    }
    refreshQueue()
  }

  if (currentId != null) {
    return <BankWorkspace bankId={currentId} onBack={close} onGone={close} />
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-2">
        {/* Beta chip retired here — it now marks the LoRA Canvas instead. */}
        <h1 className="flex items-center gap-2 text-xl font-semibold text-content"><Archive aria-hidden="true" className="h-5 w-5" /> Image bank</h1>
        <HelpBadge topic="page-bank" />
        {/* The kind of bank you are making, said WHERE you make one. Until now a
            .mp4 dropped in this folder was skipped in silence — this is the only
            place someone with a folder of rushes would ever have looked. */}
        <BankLaneTabs className="w-full sm:ml-auto sm:w-72" />
      </header>

      <form onSubmit={create}
        className="space-y-3">
        <div className="grid grid-cols-4 items-end gap-2 lg:flex lg:flex-wrap">
          <div className="col-span-2 min-w-0 lg:min-w-40 lg:grow">
            <label htmlFor="bank-name" className="mb-1 block text-sm font-medium text-content">Name</label>
            <Input id="bank-name" size="lg" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={splitMode ? 'Named per subfolder automatically' : 'Telegram export 07/2026'}
              required={!splitMode} disabled={splitMode}
              className="w-full" />
          </div>
          <FolderPickerField inline size="lg" id="bank-folder" label="Folder"
            fieldClassName="col-span-2 min-w-0 lg:min-w-64 lg:grow-[3]"
            browseClassName="min-w-0 w-full !px-1 !text-xs lg:w-auto lg:!px-4 lg:!text-sm"
            value={folder} onChange={setFolder} required
            placeholder="C:\path\to\unsorted-images (subfolders included)" />
          <Button type="button" size="lg" aria-pressed={splitMode}
            aria-label="One bank per subfolder"
            onClick={() => setSplitMode((value) => !value)}
            title={splitMode
              ? 'Enabled: create one bank for each top-level subfolder. Select to disable.'
              : 'Disabled: create one bank for this folder. Select to create one bank for each top-level subfolder.'}
            className={`min-w-0 w-full !px-1 !text-xs lg:w-auto lg:!px-4 lg:!text-sm ${splitMode ? 'border-primary/60 bg-primary/15 text-content' : ''}`}>
            Subfolders
          </Button>
          <Button type="submit" size="lg" variant="primary" disabled={creating || !!folderNotice}
            className="col-span-2 min-w-0 w-full lg:w-auto"
            title={folderNotice ? 'That folder belongs to a dataset' : undefined}>
            {creating ? 'Inventorying' : (
              <span className="inline-flex items-center gap-1.5"><Plus aria-hidden="true" className="h-4 w-4" />
                {splitMode ? 'Create Banks' : 'Create Bank'}</span>
            )}
          </Button>
          <HelpBadge topic="bank-split-subfolders" className="col-span-4 lg:col-auto" />
        </div>
        {splitMode && (
          <label className="flex items-center gap-1.5 text-sm text-content-muted">
            <input type="checkbox" checked={includeLoose}
              onChange={(e) => setIncludeLoose(e.target.checked)} />
            Include Loose Images
          </label>
        )}
        {splitMode && preview && (
          <div className="lds-section py-3 text-sm">
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
        <div className="flex items-center">
          <button type="button" onClick={() => setDialogScope({ kind: 'all' })}
            title="Queue every bank with undecided images. Banks run one at a time per machine; another machine runs its own queue alongside this one."
            className={`${btnClass({ size: 'md' })} w-full lg:w-auto border-indigo-400/50 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20`}>
            ⏳ Queue all {queueAllCount} bank(s)
          </button>
        </div>
      )}

      {/* A queue that drains into nothing is the loudest symptom of a leftover
          "GPU busy" flag — every bank is skipped and the night is wasted. The
          notice is silent unless the server says the flag has nothing behind it. */}
      <GpuBusyNotice onCleared={refreshQueue} />
      <BankQueuePanel queue={queue} nameOf={nameOf} onCancel={cancelQueued}
        onClearWaiting={clearWaiting} onStopRunning={stopRunning} />
      {/* Second way in: the scraper's own destination. A bank no longer needs a
          folder you prepared by hand — you can fill one straight from the web. */}
      <PluginSlot slot="sources.panel" surface="bank" banks={banks} onDone={() => refresh()} />

      {banks == null ? (
        <p className="text-sm text-content-muted">Loading</p>
      ) : banks.length === 0 ? (
        <p className="text-sm text-content-muted">
          No bank yet — create one above to start triaging a folder.
        </p>
      ) : (
        <div className="space-y-3">
        <div className="grid grid-cols-2 items-center gap-2 lg:flex lg:flex-wrap">
          <FolderCheckLine banks={banks} busy={rescanning} onRescan={rescan}
            className="min-w-0 w-full lg:w-auto" noticeClassName="hidden lg:block" />
          <p className="hidden text-sm text-content-muted lg:block">
            {visibleBanks.length === banks.length
              ? `${banks.length} bank(s)`
              : `showing ${visibleBanks.length} of ${banks.length}`}
          </p>
          <Input
            type="search"
            size="md"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a bank"
            aria-label="Find a bank"
            className="min-w-0 w-full lg:min-w-[9rem] lg:flex-1"
          />
          <Select size="md" value={sort} onChange={(e) => changeSort(e.target.value)}
            aria-label="Sort the banks" className="min-w-0 w-full lg:w-auto">
            {BANK_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          <Button size="md" type="button" onClick={() => {
            setSelectingBanks((value) => !value)
            if (selectingBanks) setSelectedBanks(new Set())
          }} aria-pressed={selectingBanks} className="min-w-0 w-full lg:w-auto">
            {selectingBanks ? 'Done Selecting' : 'Select Banks'}
          </Button>
          <HelpBadge topic="bank-bulk-manage" className="col-span-2 lg:col-auto" />
        </div>
        {selectingBanks && (
          <div data-probe-chrome="bank-bulk-actions"
            className="space-y-2 rounded-lg border border-indigo-400/40 bg-indigo-500/10 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-content-muted">
              <span>{bulkSelectionNote({
                selectedCount: selectedBankRows.length,
                hiddenSelectedCount,
                matchingCount: visibleBanks.length,
              })}</span>
              <button type="button" onClick={() => setSelectedBanks((prev) => selectVisibleBanks(prev, paged.items))}
                disabled={paged.items.length === 0 || selectedBankRows.length >= BANK_BULK_LIMIT}
                className={btnClass({ size: 'md' })}>Select Visible</button>
              <button type="button" onClick={() => setSelectedBanks((prev) => selectVisibleBanks(prev, visibleBanks))}
                disabled={visibleBanks.length === 0 || selectedBankRows.length >= BANK_BULK_LIMIT}
                className={btnClass({ size: 'md' })}>Select all {visibleBanks.length} matching</button>
              <button type="button" onClick={() => setSelectedBanks(new Set())} disabled={!selectedBankRows.length}
                className={btnClass({ size: 'md' })}>Clear</button>
              <span className="sm:ml-auto">Limit {BANK_BULK_LIMIT}</span>
            </div>
            {selectedBankRows.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setBulkDialog('edit')}
                  className={`${btnClass({ size: 'md' })} w-full border-indigo-400/50 text-indigo-200`}>Edit Banks</button>
                <button type="button" onClick={() => setBulkDialog('delete')}
                  className={`${btnClass({ size: 'md' })} w-full border-rose-500/60 text-rose-200`}>Delete Banks</button>
              </div>
            )}
          </div>
        )}
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
          {listRows.map((row) => {
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
            const selected = selectedBanks.has(bankSelectionKey(b))
            return (
            <li key={row.key}
              className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-surface p-4 ${selected ? 'border-indigo-400' : 'border-border'}`}>
              <div className="flex min-w-0 items-center gap-2">
                {selectingBanks && (
                  <label className="flex min-h-10 min-w-10 shrink-0 items-center justify-center">
                    <input type="checkbox" checked={selected} onChange={() => toggleBankSelection(b)}
                      disabled={!b.instance_id || (!selected && selectedBankRows.length >= BANK_BULK_LIMIT)}
                      aria-label={`Select bank ${b.name}`}
                      className="h-5 w-5 accent-indigo-400 disabled:opacity-50" />
                  </label>
                )}
                {/* Upstream's opener is a bare <button> here; this fork wraps it
                    in BankTitle, which adds the ✎ inline rename. The probe's
                    `prime` selector — [aria-label^="Open the bank"] — travels
                    with the button INTO that component, so the label is on
                    BankTitle's open button rather than on this line. */}
                {selectingBanks ? (
                  <button type="button" onClick={() => toggleBankSelection(b)} disabled={!b.instance_id}
                    className="min-h-10 min-w-0 grow truncate text-left text-base font-semibold text-content disabled:opacity-50">
                    {b.name}
                  </button>
                ) : <BankTitle bank={b} onOpen={() => open(b.id)}
                  onRename={(newName) => rename(b, newName)} />}
                {b.activity && !b.activity.finished && (
                  <span className="text-xs text-amber-300">⏳ {b.activity.kind}</span>
                )}
                {qs && (
                  <span className="rounded bg-indigo-500/15 px-1.5 py-px text-2xs font-semibold text-indigo-300">
                    {qs.state === 'running' ? 'running' : `queued · #${qs.position}`}
                  </span>
                )}
                {!selectingBanks && <button type="button" onClick={() => setRelocating(b)}
                  aria-label={`Move the folder of bank ${b.name}`}
                  title="Moved this folder to another disk? Point the bank at its new location."
                  className="ml-auto px-1.5 text-content-subtle hover:text-content"><FolderInput aria-hidden="true" className="h-4 w-4" /></button>}
                {!selectingBanks && <button type="button" onClick={() => remove(b)} aria-label={`Remove bank ${b.name}`}
                  className="px-1.5 text-content-subtle hover:text-rose-300"><X aria-hidden="true" className="h-4 w-4" /></button>}
              </div>
              <p className="truncate font-mono text-xs text-content-subtle" title={b.source_path}>
                {b.source_path}
              </p>
              {!selectingBanks && <BankPreviewStrip bank={b} onOpen={() => open(b.id)} />}
              {/* Upstream's richer bar-and-breakdown replaces the plain-text
                  count line this used to be; the two badges below carry
                  information BankListSummary does not (the last Launch-all's
                  verdict, per-pass coverage) and are kept alongside it. */}
              {!selectingBanks && <BankListSummary bank={b} />}
              {/* The last Launch-all's verdict, ON THE CARD. A run where every
                  GPU pass was skipped for "GPU busy" used to look identical to a
                  clean one from here — and queueing banks overnight is exactly
                  when nobody is watching. A clean run gets no badge: a tick on
                  every card makes the one amber card harder to spot. */}
              {!selectingBanks && <PipelineVerdictNote report={b.pipeline_report} />}
              {!selectingBanks && (
                <div className="flex flex-wrap items-center gap-2">
                  <PassCoverageRow coverage={b.pass_coverage} />
                  <div className="grid w-full grid-cols-2 gap-2 lg:ml-auto lg:flex lg:w-auto">
                    <button type="button" onClick={() => open(b.id)}
                      className={`${btnClass({ size: 'sm' })} min-w-0 w-full lg:w-auto ${qs ? 'col-span-2' : ''}`}>
                      Open →
                    </button>
                    {!qs && (
                      <button type="button" onClick={() => setDialogScope({ kind: 'bank', bankId: b.id })} disabled={b.total === 0}
                        title="Run Launch all now, or add this bank to the queue"
                        className={`${btnClass({ size: 'sm', variant: 'ghost' })} min-w-0 w-full lg:w-auto`}>
                        Launch All
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!selectingBanks && <FolderSyncNote sync={b.folder_sync}
                onRelocate={() => setRelocating(b)}
                onForget={() => setForgetting(b)} />}
            </li>
            )
          })}
        </ul>
        <Pagination page={paged.page} pages={paged.pages} pageSize={paged.pageSize}
          total={paged.total} rangeStart={paged.rangeStart} rangeEnd={paged.rangeEnd}
          onPage={setPage} onPageSize={setPageSize} label="Banks per page" />
        </div>
      )}

      {dialogScope && (
        <LaunchAllDialog caps={caps} visionReady={visionReady}
          scope={dialogScope.kind}
          onClose={() => setDialogScope(null)}
          onLaunch={runNow} onQueue={enqueue} />
      )}

      {bulkDialog === 'edit' && (
        <BankBulkDialog banks={selectedBankRows} onClose={() => setBulkDialog(null)}
          onResults={(results) => applyBulkResults(results, false)} />
      )}

      {bulkDialog === 'delete' && (
        <BankBulkDeleteDialog banks={selectedBankRows} onClose={() => setBulkDialog(null)}
          onResults={(results) => applyBulkResults(results, true)} />
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
