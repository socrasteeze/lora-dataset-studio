// 🔖 Tags-pass gate, UI side (PURE JS, JSX-free so node --test can import it).
//
// Same ranked shape as faceScoringGate.js. The rules, in order, and why:
//
//   1. a job already running on this bank outranks everything — installing
//      something would not help, and the button must say what is actually true;
//   2. the capability outranks the empty-bank hint, which is pointless advice on
//      a machine that could not tag anything anyway;
//   3. `capsLoading` keeps the button quiet rather than flashing "not installed"
//      for the split second before capabilities land.
//
// The capability reason is passed through from the server (caps.wd14_detail)
// because ✗ has two causes here — no onnxruntime, or no model download — that
// the user fixes in different places.

const RUN_TITLE = 'Labels what is in each picture (hair colour, clothing, setting) so the '
  + 'bank can be filtered by it. Runs locally and never writes captions.';
const EMPTY_TITLE = 'Scan the bank first — there is nothing to tag yet';
const SETUP_ROUTE = '#/setup?step=quality';

const notInstalled = (detail) => 'Image tagging is not installed — Setup ▸ Quality tools'
  + (detail ? ` (${detail})` : ' (installs the WD14 tagger, ~400 MB)');

/** {disabled, title, blocked, reason, setupRoute} for the 🔖 Tags button.
 *
 *  @param capable      caps.wd14
 *  @param detail       caps.wd14_detail — which half is missing
 *  @param capsLoading  capabilities still in flight
 *  @param busyKind     the kind of job already running on this bank, or null
 *  @param scanned      how many images the bank has inventoried
 */
export function tagsButtonState({ capable = true, detail = '', capsLoading = false,
                                  busyKind = null, scanned = 0 } = {}) {
  if (busyKind) {
    const title = `A ${busyKind} pass is already running on this bank`;
    return { disabled: true, title, blocked: false, reason: null, setupRoute: null };
  }
  if (!capsLoading && !capable) {
    const reason = notInstalled(detail);
    return { disabled: true, title: reason, blocked: true, reason, setupRoute: SETUP_ROUTE };
  }
  if (!Number(scanned)) {
    return { disabled: true, title: EMPTY_TITLE, blocked: false,
             reason: null, setupRoute: null };
  }
  return { disabled: false, title: RUN_TITLE, blocked: false,
           reason: null, setupRoute: null };
}

/** Label for the 🔖 button: names the scope, so the pass is not a mystery.
 *  `counts` = the bank payload's counts ({total, reject, tagged}). An older
 *  payload with no `tagged` key falls back to the bare label rather than
 *  inventing a number. */
export function tagsButtonLabel(counts) {
  const total = Number(counts?.total);
  const reject = Number(counts?.reject) || 0;
  const tagged = Number(counts?.tagged);
  if (!Number.isFinite(total) || total <= 0) return '🔖 Tags';
  const inPlay = Math.max(0, total - reject);
  if (!Number.isFinite(tagged)) return `🔖 Tags (${inPlay})`;
  const left = Math.max(0, inPlay - tagged);
  // "0 new" is worth saying out loud: it is the difference between "this pass
  // has nothing to do" and "this pass has never run", and re-running would
  // otherwise look like it silently did nothing.
  if (tagged > 0 && left === 0) return `🔖 Tags (all ${inPlay} done)`;
  if (tagged > 0) return `🔖 Tags (${left} new)`;
  return `🔖 Tags (${inPlay})`;
}

/** Should the facet filter row be shown at all?
 *
 *  Only once the pass has actually tagged something — the same "don't show chips
 *  for a pass that has not run" rule the framing chips follow. An active filter
 *  keeps the row visible even if the count is somehow zero, so a user can always
 *  see and clear what is narrowing their view. A filter you cannot see is the
 *  one bug this rule exists to prevent.
 */
export function showTagFilters({ tagged = 0, activeTags = [] } = {}) {
  return Number(tagged) > 0 || (activeTags || []).length > 0;
}
