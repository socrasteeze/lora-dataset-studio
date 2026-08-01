/* Per-pass coverage badges — "what has actually been done to this bank".
 *
 * WHY IT IS WORTH A BADGE AT ALL.
 *
 * Until now the only way to find out whether a bank had ever had a face pass
 * was to queue one and watch. Queue-all made that worse rather than better: it
 * sent the same step list to every eligible bank, so re-running a caption pass
 * that finished last night looked like progress for hours, while a fully
 * triaged bank that had never been face-passed was not eligible at all.
 *
 * The server now answers per bank per pass (`pass_coverage`), and it is the
 * SAME predicate the queue uses to decide what to skip. This file only decides
 * what to draw with that answer — it never re-derives "is this pass done",
 * because a second copy of that rule is exactly how the ≈ duplicate mark came
 * to disagree with the chip beside it for 10 060 images.
 *
 * A MISSING entry draws nothing. An older payload, or a bank with no images,
 * then reads as "no information" rather than a confident all-clear.
 */

/* Order and glyphs follow the pipeline itself, so the badges read left to right
 * in the order the passes run. Labels match the buttons the user clicks. */
export const COVERAGE_PASSES = [
  { key: 'scan', mark: '🔎', label: 'Scan' },
  { key: 'score', mark: '✨', label: 'Score' },
  { key: 'watermark', mark: '🚩', label: 'Watermarks' },
  { key: 'faces', mark: '👥', label: 'Group by person' },
  { key: 'framing', mark: '📐', label: 'Framing' },
  { key: 'caption', mark: '🏷️', label: 'Caption' },
]

/** Badges for one bank card: [{key, text, cls, title}].
 *
 *  Two states only, because a third would be noise at card size:
 *    complete → the glyph alone, muted;
 *    pending  → the glyph and the COUNT still to do, highlighted.
 *  A pass with nothing done yet is still "pending N" rather than a separate
 *  "never run" state: for deciding what to queue they mean the same thing, and
 *  the count already says how much. */
export function coverageBadges(coverage) {
  if (!coverage) return []
  const out = []
  for (const p of COVERAGE_PASSES) {
    const c = coverage[p.key]
    if (!c) continue
    const pending = Number(c.pending) || 0
    if (c.complete) {
      out.push({
        key: p.key,
        text: p.mark,
        cls: 'text-slate-500',
        title: `${p.label} — done`,
      })
    } else {
      out.push({
        key: p.key,
        text: `${p.mark} ${pending}`,
        cls: 'text-amber-300',
        title: `${p.label} — ${pending} image(s) still to do`,
      })
    }
  }
  return out
}

/** One-line summary for a tooltip or a group card, e.g. "4 of 6 passes done".
 *  Returns '' when there is nothing to report, so a caller can render nothing
 *  rather than "0 of 0". */
export function coverageSummary(coverage) {
  if (!coverage) return ''
  const known = COVERAGE_PASSES.filter((p) => coverage[p.key])
  if (!known.length) return ''
  const done = known.filter((p) => coverage[p.key].complete).length
  return `${done} of ${known.length} passes done`
}
