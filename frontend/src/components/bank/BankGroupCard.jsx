import { useState } from 'react'
import { groupLabel, groupOverlapNote } from './bankGroups'
import { pipelineBadge, pipelineReportVerdict } from './pipelineVerdict'

/** Banks that share a name, as ONE card.
 *
 * Nothing was merged: every image still belongs to exactly one bank, and every
 * write still lands on a row that knows which. This card is a display device —
 * combined counts, one queue action, one promote — and the members are all still
 * there behind a disclosure, each with its own rename, relocate, delete and
 * "keep separate".
 *
 * There is deliberately NO group-level ✕. One click deleting five banks is the
 * wrong default, and the per-member ✕ inside the disclosure is one extra click
 * for something irreversible.
 */
export default function BankGroupCard({
  row, onOpen, onQueue, onPromote, onKeepSeparate, onRename, onRelocate, onRemove,
  queueStateOf,
}) {
  const [open, setOpen] = useState(false)
  const overlap = groupOverlapNote(row)
  const queued = row.members.filter((m) => queueStateOf?.(m)).length
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-indigo-400/40 bg-surface p-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-content">{row.name}</span>
        <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-px text-[10px] font-semibold text-indigo-300">
          {row.members.length} banks
        </span>
        {queued > 0 && (
          <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-px text-[10px] font-semibold text-indigo-300">
            {queued} in the queue
          </span>
        )}
      </div>
      <p className="text-xs text-content-subtle">{groupLabel(row.members.length - 1)}</p>
      <p className="text-xs text-content-muted">
        {row.total} image(s) · {row.scanned} scanned ·{' '}
        <span className="text-emerald-300">{row.keep} kept</span> ·{' '}
        <span className="text-rose-300">{row.reject} rejected</span>
      </p>
      {/* Counters are summed from the member rows, so overlapping folders make
          them add the same image twice. Said out loud rather than hidden: a
          number that is quietly wrong is worse than one that is explained. */}
      {overlap && <p className="text-xs text-amber-300">⚠ {overlap}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onQueue?.(row)}
          title="Queue every bank in this group — one entry each, and only ever one of them running at a time"
          className="rounded-md border border-indigo-400/50 px-3 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/10">
          ⏳ Queue the group…
        </button>
        <button type="button" onClick={() => onPromote?.(row)} disabled={row.keep === 0}
          title="Promote every kept image in this group into one dataset"
          className="rounded-md border border-border px-3 py-1 text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-raised disabled:opacity-50">
          ⬆ Promote the group…
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto rounded-md border border-border px-2 py-1 text-xs text-content-muted hover:text-content hover:bg-surface-raised">
          {open ? '▾' : '▸'} {row.members.length} banks
        </button>
      </div>

      {open && (
        <ul className="space-y-2 border-t border-border pt-2">
          {row.members.map((m) => {
            const badge = pipelineBadge(pipelineReportVerdict(m.pipeline_report))
            return (
              <li key={m.id} className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-xs font-medium text-content">{m.name}</span>
                  <span className="shrink-0 text-[10px] text-content-subtle">
                    {m.total} · {m.keep} kept
                  </span>
                  <button type="button" onClick={() => onRename?.(m)}
                    aria-label={`Rename bank ${m.name}`}
                    title="Rename — renaming it away from this name leaves the group"
                    className="ml-auto px-1 text-content-subtle hover:text-content">✏️</button>
                  <button type="button" onClick={() => onRelocate?.(m)}
                    aria-label={`Move the folder of bank ${m.name}`}
                    className="px-1 text-content-subtle hover:text-content">📦</button>
                  <button type="button" onClick={() => onRemove?.(m)}
                    aria-label={`Remove bank ${m.name}`}
                    className="px-1 text-content-subtle hover:text-rose-300">✕</button>
                </div>
                <p className="truncate font-mono text-[10px] text-content-subtle" title={m.source_path}>
                  {m.source_path}
                </p>
                {badge && (
                  <p title={badge.title}
                    className={`text-[10px] ${badge.tone === 'error' ? 'text-rose-300' : 'text-amber-300'}`}>
                    {badge.label} in its last 🚀 Launch all
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onOpen?.(m.id)}
                    className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold text-content hover:bg-surface-raised">
                    Open →
                  </button>
                  <label className="flex items-center gap-1 text-[10px] text-content-muted">
                    <input type="checkbox" checked={Boolean(m.keep_separate)}
                      onChange={(e) => onKeepSeparate?.(m, e.target.checked)} />
                    Keep separate
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
