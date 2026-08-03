/* WHETHER THE BANK'S FILTER PANEL OPENS FOLDED — and why it is decided once.
 *
 * The panel (search boxes, ~29 chips, thresholds, the View row) is roughly
 * fifteen wrapped rows on a 390 px phone — about a thousand pixels between the
 * top of ② Triage and the first thumbnail. Folded behind a one-line summary
 * (bankFilterSummary.js) it costs almost nothing; expanded it is exactly what
 * you get today.
 *
 * WHY THE DECISION IS MADE ONCE, AT MOUNT, NOT LIVE ON RESIZE.
 * A live `sm:`-style rule would fold and unfold the panel as the viewport
 * changes — rotating a phone to landscape crosses the threshold both ways, so
 * a panel you are mid-scroll through would spring open under your thumb, or
 * swallow the chip you were about to tap. `lightboxActionPlacement.js` needs a
 * whole hysteresis band to make a much smaller UI element (a six-button rail)
 * survive that; this module sidesteps the problem entirely by deciding once
 * and then leaving the panel to the person using it, exactly like that file's
 * own "the first decision passes no `current`, there is nothing to stabilise"
 * rule — except here NOTHING ever re-decides after mount.
 *
 * WHY A STORED ANSWER ALWAYS WINS OVER THE WIDTH GUESS.
 * The width rule is a guess about what you'd probably want. The stored value
 * is what you actually did with the chevron last time. A guess must never
 * override a real answer, on any screen size.
 */

/** Tailwind's `sm`. Below it the panel opens folded when nothing is stored —
 *  the same line the thresholds gloss and the grid's column count already use
 *  elsewhere in this file's parent component. */
export const FILTER_PANEL_WIDE_PX = 640

/** localStorage key — a PERMANENT handle (CLAUDE.md: never rename a stored
 *  key without an alias). Global, not per bank: "do I have room for the
 *  chips" is a property of the screen you're on, not of which bank you
 *  opened — unlike the grid sort, which genuinely differs per bank. */
export const FILTERS_OPEN_KEY = 'bankFiltersOpen'

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/** @returns {boolean|null} the remembered answer, or null if never chosen. */
export function loadFiltersOpen() {
  try {
    const v = store()?.getItem(FILTERS_OPEN_KEY)
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch { return null }
}

/** Persist the answer. Swallows a full-quota / private-mode failure — a
 *  chevron that otherwise worked must not start throwing. */
export function saveFiltersOpen(open) {
  try { store()?.setItem(FILTERS_OPEN_KEY, open ? '1' : '0') } catch { /* ignore — private mode */ }
}

/**
 * @param {object} input
 * @param {boolean|null} [input.stored]        loadFiltersOpen()'s answer
 * @param {number} [input.viewportWidth]       window.innerWidth, read once at mount
 * @returns {boolean} true = open, false = folded behind the summary
 */
export function initialFiltersOpen({ stored = null, viewportWidth } = {}) {
  if (stored === true || stored === false) return stored
  // No usable width (SSR, a test render, a browser reporting 0): default OPEN.
  // Folding controls we can't prove are too big is the worse mistake — it
  // reads as "the filters were removed", not as a considered default.
  if (typeof viewportWidth !== 'number' || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return true
  }
  return viewportWidth >= FILTER_PANEL_WIDE_PX
}
