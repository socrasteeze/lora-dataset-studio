import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../api/fetchClient'
import {
  activityHeadline, eventPrefix, formatClock, mergeEvents, nextCursor,
  runningWhere, stallState,
} from '../../utils/activityLog'

/** 📋 Activity — what the whole app is doing, in one place.
 *
 * Every long job here already has a progress bar, and every bar lives on the
 * page that owns it: a bank pass on that bank, a caption batch on that dataset,
 * training on Runs, the GPU flags nowhere at all. So "is anything moving?" costs
 * a tour of the app — and a percentage cannot answer it anyway, because a bar
 * frozen at 34% and a bar that will move again in two seconds are drawn
 * identically.
 *
 * Two halves, and the first is the one people open this for:
 *
 * • RUNNING — every live job with the AGE of its last update. That age is what
 *   separates slow from stuck, and it is the only thing here that does.
 * • LOG — a timestamped feed of starts, stops, failures and GPU transitions,
 *   appended as it arrives (never redrawn: a full redraw every two seconds
 *   loses the scroll position mid-read).
 *
 * Polling is cursor-based and cheap — an in-memory snapshot, no folder walks —
 * and it stops entirely while the panel is closed.
 */
const TONE = {
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  error: 'text-rose-300',
  info: 'text-content-muted',
}

export default function ActivityPanel({ onClose }) {
  const [snapshot, setSnapshot] = useState(null)
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const cursor = useRef(undefined)
  const feed = useRef(null)
  const pinned = useRef(true)

  const poll = useCallback(async () => {
    try {
      const qs = cursor.current == null ? '' : `?since=${cursor.current}`
      const d = await apiFetch(`/api/system/activity${qs}`, { background: true })
      setSnapshot(d)
      if (d.events?.length) {
        setEvents((prev) => mergeEvents(prev, d.events))
        cursor.current = nextCursor(d.events) ?? cursor.current
      }
      setError('')
    } catch (e) {
      setError(e?.message || 'Could not read the activity.')
    }
  }, [])

  useEffect(() => {
    poll()
    const t = setInterval(poll, 2000)
    return () => clearInterval(t)
  }, [poll])

  // Follow the tail only while the user is already at the bottom — scrolling up
  // to read something is exactly when a forced scroll is most infuriating.
  useEffect(() => {
    const el = feed.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [events])

  const onScroll = () => {
    const el = feed.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const headline = activityHeadline(snapshot)
  const running = snapshot?.running || []
  const queued = snapshot?.bank_queue?.items || []

  return (
    <div role="dialog" aria-modal="true" aria-label="Activity"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-2 sm:p-4">
      <div className="mt-4 flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 rounded-xl border border-border bg-surface-overlay p-4 shadow-2xl sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-content">📋 Activity</h2>
          <span className={`text-xs ${TONE[headline.tone]}`}>{headline.text}</span>
          <button type="button" onClick={onClose}
            className="ml-auto rounded-md border border-border px-3 py-1 text-xs text-content hover:bg-surface-raised">
            Close
          </button>
        </div>

        {error && (
          <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {/* ── Running now ─────────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">
            Running now
          </p>
          {running.length === 0 ? (
            <p className="text-xs text-content-muted">Nothing is running.</p>
          ) : (
            <ul className="space-y-1">
              {running.map((r) => {
                const stall = stallState(r.stale_seconds)
                return (
                  <li key={`${r.kind}-${r.bank_id ?? r.dataset_id ?? r.job_id}-${r.what}`}
                    className="rounded border border-border bg-surface p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium text-content">{r.label}</span>
                      <span className="text-content-muted">
                        {r.what}{runningWhere(r)}
                      </span>
                      {r.total > 0 && (
                        <span className="text-content-subtle">{r.done}/{r.total}</span>
                      )}
                      {/* The age is the whole point of this panel. */}
                      {stall && <span className={TONE[stall.tone]}>⚠ {stall.label}</span>}
                    </div>
                    {r.detail && (
                      <p className="mt-0.5 text-[0.6875rem] text-content-subtle">{r.detail}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {queued.length > 0 && (
            <p className="text-[0.6875rem] text-content-subtle">
              Waiting: {queued.map((q) => (
                q.device_id && q.device_id !== 'local' ? `#${q.bank_id} (remote)` : `#${q.bank_id}`
              )).join(', ')} — one at a time per machine.
            </p>
          )}
        </div>

        {/* ── The log ─────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">
            Log
          </p>
          <div ref={feed} onScroll={onScroll}
            className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-app/60 p-2 font-mono text-[0.6875rem] leading-relaxed">
            {events.length === 0 ? (
              <p className="text-content-subtle">
                Nothing yet — this fills up as passes start, finish and fail.
              </p>
            ) : events.map((e) => (
              <div key={e.id} className="flex gap-2">
                <span className="shrink-0 text-content-subtle">{formatClock(e.at)}</span>
                <span className="shrink-0 text-content-subtle">[{eventPrefix(e)}]</span>
                <span className={TONE[e.level] || TONE.info}>
                  {e.message}{e.detail ? ` — ${e.detail}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
