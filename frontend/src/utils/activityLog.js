/* The activity panel's decidable half — "is it stuck?", in numbers.
 *
 * Every long job in LDS already has a progress bar, and every bar lives on the
 * page that owns it. So the question people actually have — is anything moving
 * — needs a tour of the app to answer, and a percentage cannot answer it at all:
 * a bar frozen at 34% and a bar that will move again in two seconds are drawn
 * identically.
 *
 * What separates them is the AGE of the last update, which the server reports
 * per running job. This file turns that number into the three words the panel
 * shows, and does it here rather than inline so the thresholds are testable and
 * live in one place.
 */

/** Seconds of silence before a running job is called slow, then stuck.
 *
 *  Deliberately generous. A scoring pass on CPU reports every image at ~336 ms,
 *  but a cold model load, a big folder walk or a vision batch can legitimately
 *  say nothing for a minute — and crying "stuck" at a pass that is merely
 *  loading is how a warning gets ignored when it is real. */
export const SLOW_AFTER_SECONDS = 60
export const STUCK_AFTER_SECONDS = 300

/** {tone, label} for one running row, or null when it is reporting normally.
 *  null on an unknown age: "we don't know" must never render as "it's fine"
 *  with a green tick, nor as an alarm. */
export function stallState(stale) {
  if (stale == null || Number.isNaN(Number(stale))) return null
  const s = Number(stale)
  if (s >= STUCK_AFTER_SECONDS) {
    return { tone: 'error', label: `no update for ${formatAge(s)} — probably stuck` }
  }
  if (s >= SLOW_AFTER_SECONDS) {
    return { tone: 'warn', label: `no update for ${formatAge(s)}` }
  }
  return null
}

/** Compact age: "8s", "3m", "1h 4m". */
export function formatAge(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** The one-line headline above the panel. Says the WORST thing that is true —
 *  "3 running" over a job that has said nothing for ten minutes is the sentence
 *  that made this panel necessary. */
export function activityHeadline(snapshot) {
  const running = snapshot?.running || []
  const queued = (snapshot?.bank_queue?.items || []).length
  const flags = snapshot?.gpu_flags || {}
  const stuck = running.filter(
    (r) => stallState(r.stale_seconds)?.tone === 'error').length
  if (stuck) {
    return { tone: 'error', text: `${stuck} of ${running.length} running job(s) stopped reporting.` }
  }
  if (!running.length) {
    // A flag with nothing behind it is the single most confusing state the app
    // produces, and this panel is where it becomes obvious.
    if (flags.vision_in_progress || flags.training_in_progress) {
      return {
        tone: 'warn',
        text: 'Nothing is running, but the GPU is still marked busy — that flag is stale.',
      }
    }
    return { tone: 'ok', text: queued ? `Idle — ${queued} bank(s) waiting.` : 'Idle.' }
  }
  const tail = queued ? `, ${queued} waiting` : ''
  return { tone: 'ok', text: `${running.length} running${tail}.` }
}

/** Merge a poll's new events into the list already on screen, oldest first and
 *  capped. Append-not-replace is the point: a full redraw every two seconds
 *  loses the scroll position mid-read, which is the one thing a log must not
 *  do. Deduplicated on id so a re-sent event cannot appear twice. */
export function mergeEvents(existing, incoming, cap = 500) {
  const seen = new Set((existing || []).map((e) => e.id))
  const merged = [...(existing || [])]
  for (const e of incoming || []) {
    if (e && !seen.has(e.id)) { seen.add(e.id); merged.push(e) }
  }
  merged.sort((a, b) => (a.id || 0) - (b.id || 0))
  return merged.slice(-cap)
}

/** The cursor for the next poll: the highest id seen, or undefined on an empty
 *  list (asking `since=0` and asking for everything must not differ). */
export function nextCursor(events) {
  const ids = (events || []).map((e) => e?.id).filter((n) => Number.isFinite(n))
  return ids.length ? Math.max(...ids) : undefined
}

/** hh:mm:ss for an event's epoch-seconds timestamp, or '' when there isn't one.
 *
 *  The `|| 0` fallback that used to be here rendered an unparseable timestamp as
 *  00:00:00 — which reads as midnight, not as "unknown". A log whose clock can
 *  quietly lie is worse than one with a blank in it. */
export function formatClock(at, locale) {
  const n = Number(at)
  if (!Number.isFinite(n)) return ''
  const d = new Date(n * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(locale, { hour12: false })
}

/** The bracketed prefix for one log line: the source, plus the machine when the
 *  work did NOT happen here.
 *
 *  A pass sent to a compute peer used to log word-for-word what a local one
 *  logged — same "score started", same "finished" — so the only place the app
 *  narrates itself could not answer "where did this run". The device name (never
 *  its uuid) rides the event; this turns it into `bank · Laptop 4090`. */
export function eventPrefix(e) {
  const src = String((e && e.source) || '').trim() || 'app'
  const device = e && e.device ? String(e.device).trim() : ''
  return device ? `${src} · ${device}` : src
}

/** " · on <device>" for a running row, or '' when it is running here. Separate
 *  from eventPrefix because the running list already shows the bank's own name
 *  in the same line and a second bracket there reads as a second job. */
export function runningWhere(row) {
  const device = row && row.device ? String(row.device).trim() : ''
  return device ? ` · on ${device}` : ''
}
