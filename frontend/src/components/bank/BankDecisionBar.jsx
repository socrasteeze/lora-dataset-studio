import { UNDO_HINT, undoBannerText } from './bankUndo.js'

/* THE BANK'S PINNED DECISION BAR.
 *
 * Selecting thumbnails used to mean scrolling to the bottom of ② Triage to
 * tap tiles, then scrolling all the way back up past the filter panel to
 * reach ✓ Keep / ✕ Reject, which lived inline at the end of the results
 * readout row. This bar puts those actions where the selection is: it renders
 * as the LAST child of the workspace's root `space-y-4` column (after the
 * grid and its pagination, before the modals), so on any page long enough to
 * scroll it settles at the bottom of the viewport.
 *
 * STICKY, NEVER FIXED — this is the whole point, not a style preference. A
 * `fixed` bar is painted OVER the page: the last row of thumbnails and the
 * pagination controls would live under it permanently, and no hand-guessed
 * bottom padding on the page survives the bar wrapping to a second line on a
 * narrow phone. `position: sticky` keeps the bar in NORMAL DOCUMENT FLOW — the
 * page grows by exactly the bar's height, so scrolling to the very end of the
 * page lands the bar sitting in the flow with the last grid row and the
 * pagination nav fully visible above it. Nothing is ever trapped behind it.
 * It only pins to the viewport bottom while there is still page below it to
 * scroll past; on a bank small enough to fit one screen it just sits quietly
 * under the grid, which is the honest answer — there is nothing to pin.
 *
 * z-30: below the app header (z-40), the filter/curate popover scrims
 * (z-40/z-50) and dialogs (z-50), the review lightbox (z-[9996]) and the
 * toast (z-[10000], pinned by Toast.contract.test.js). A bar above its own
 * popover scrim would stay clickable through it.
 *
 * ONE SLOT, TWO JOBS: while something is selected it shows the bulk actions;
 * otherwise, if there's an undo offer, it shows that instead (an offer is
 * quiet exactly when a decision needs to be made, so the two never compete —
 * batchStatus clears the selection at the same moment an offer can appear).
 * With neither, it renders nothing and costs no space.
 *
 * EVEN WEIGHT, TWO ROWS — Keep and Reject used to size to their labels, so
 * Keep sat wider than Reject and the rest (Skip, the two rotate glyphs, CLR)
 * wrapped into a second ragged row. Both decision pairs now share a two-column
 * grid the same way the header's Promote / Delete rejected row does; the
 * rotate pair sits next to the count as equal icon buttons so they cannot
 * look like a third reset.
 *
 * Skip here is "set these back to undecided", not the review-lightbox ⏭ Skip
 * (leave pending and go to the next photo). The tooltip spells that out.
 */
const DECIDE = 'inline-flex h-full w-full min-w-0 items-center justify-center '
  + 'rounded-lg px-2 py-1.5 text-sm font-semibold'
const ROTATE = 'inline-flex h-8 w-8 shrink-0 items-center justify-center '
  + 'rounded-lg border border-border text-sm text-content-muted '
  + 'hover:bg-surface-raised hover:text-content'

export default function BankDecisionBar({
  selected, onKeep, onReject, onUndecided, onRotateLeft, onRotateRight, onClear,
  undoOffer, undoBusy, onUndo, onUndoDismiss,
}) {
  const count = selected?.size || 0
  if (count === 0 && !undoOffer) return null
  return (
    <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-surface-overlay/95 px-4 py-2 shadow-[0_-4px_12px_-6px_rgb(0_0_0/0.4)] backdrop-blur-sm pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {count > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 grow text-xs font-semibold tabular-nums text-content">
              {count.toLocaleString()} selected
            </span>
            {/* Your own files are never rewritten: the angle is stored on the row
                and applied to what the app shows and to what it promotes — four
                turns cost the original nothing. Icon-only here so they cannot
                wrap into a second ragged row; the word stays in sr-only / aria. */}
            <button type="button" onClick={onRotateLeft}
              aria-label={`Rotate the ${count} selected image(s) 90 degrees left`}
              title="Rotate 90° left (counter-clockwise). Your own files are never modified."
              className={ROTATE}>
              <span aria-hidden="true">↺</span><span className="sr-only">Rotate left</span>
            </button>
            <button type="button" onClick={onRotateRight}
              aria-label={`Rotate the ${count} selected image(s) 90 degrees right`}
              title="Rotate 90° right (clockwise). Your own files are never modified."
              className={ROTATE}>
              <span aria-hidden="true">↻</span><span className="sr-only">Rotate right</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onKeep}
              className={`${DECIDE} border border-emerald-400/60 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30`}>
              ✓ Keep
            </button>
            <button type="button" onClick={onReject}
              className={`${DECIDE} border border-rose-400/60 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30`}>
              ✕ Reject
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onUndecided}
              title="Set these images back to undecided"
              aria-label="Set the selected images back to undecided"
              className={`${DECIDE} border border-border text-content-muted hover:bg-surface-raised hover:text-content`}>
              Skip
            </button>
            <button type="button" onClick={onClear}
              title="Clear selection"
              aria-label="Clear selection"
              className={`${DECIDE} border border-border text-content-muted hover:bg-surface-raised hover:text-content`}>
              CLR
            </button>
          </div>
        </div>
      ) : (
        // ↩ The net under the bank's biggest gesture. Deliberately NOT a toast
        // — a bar that vanishes after four seconds is unusable for anyone who
        // reads slowly, and this is the control you reach for right after
        // realising you just marked 400 images wrong. It stays until used,
        // dismissed, or replaced by a newer action, and it is fed by the bank
        // payload so it survives a reload. `role="status"` + `aria-live` tell a
        // screen reader it exists without stealing focus from the grid.
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-content">
          <p className="m-0 min-w-0 grow basis-full sm:basis-auto">
            <span aria-hidden>↩</span>{' '}
            <span className="font-semibold">{undoBannerText(undoOffer)}</span>
            <span className="block text-xs text-content-muted sm:inline sm:before:content-['_—_']">
              {UNDO_HINT}
            </span>
          </p>
          <button type="button" onClick={onUndo} disabled={undoBusy}
            className="rounded border border-sky-400/60 px-2 py-1 text-xs font-semibold hover:bg-white/10 disabled:opacity-50">
            {undoBusy ? 'Undoing…' : '↩ Undo'}
          </button>
          <button type="button" onClick={onUndoDismiss} disabled={undoBusy}
            title="Keep the change and hide this"
            className="rounded border border-border px-2 py-1 text-xs text-content-muted hover:bg-surface-raised hover:text-content disabled:opacity-50">
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
