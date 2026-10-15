/* "One bank per subfolder", with folders left out — the decidable half.
 *
 * Exclusions are CLIENT state, sent only on create. They are deliberately NOT
 * part of the preview request: that effect is debounced on the folder path, so
 * an exclusion-aware preview would mean one re-POST per checkbox and a race
 * between what is ticked and what is drawn. The server walks with the exclusion
 * list once, at create time. Separate banks prune excluded subfolders from
 * their walk. One parent bank persists exclusions through its existing
 * visibility scope so hidden folders can be restored later.
 *
 * The count on screen ("Will create N bank(s)") therefore has to be computed
 * here rather than taken from the server — which is exactly why it lives in a
 * unit-testable file instead of inline in the JSX.
 */

/** The excluded names as a plain sorted array of non-empty strings — the shape
 *  the route wants. A Set, an array, or null all normalise. */
export function normalizeExcluded(excluded) {
  const list = excluded instanceof Set ? [...excluded] : (excluded || [])
  return [...new Set(list.map((n) => String(n ?? '').trim()).filter(Boolean))].sort()
}

/** What the import will actually do, from the (exclusion-free) preview plus the
 *  local exclusions. Returns {rows, bankCount, allExcluded, imageCount} where
 *  each row is {name, imageCount, excluded, kind}.
 *
 *  `allExcluded` is the case that matters: with every subfolder ticked off, the
 *  server refuses unless there are loose images to fall back on — because its
 *  no-subfolder fallback imports the PARENT, which would recurse straight back
 *  into everything just excluded. The UI must say so before the click, not
 *  surface it as a 400. */
export function splitPlan({ preview, excluded, includeLoose = true, splitBanks = true }) {
  const skip = new Set(normalizeExcluded(excluded))
  const subs = preview?.subfolders || []
  const rows = subs.map((s) => ({
    name: s.name,
    imageCount: Number(s.image_count) || 0,
    excluded: skip.has(s.name),
    kind: 'subfolder',
  }))
  const loose = Number(preview?.loose_root_count) || 0
  if (loose > 0) {
    rows.push({
      name: '(loose files)',
      imageCount: loose,
      excluded: !includeLoose,
      kind: 'loose',
    })
  }
  const kept = rows.filter((r) => !r.excluded)
  const imageCount = kept.reduce((n, r) => n + r.imageCount, 0)
  return {
    rows,
    bankCount: splitBanks ? kept.length : (imageCount > 0 ? 1 : 0),
    imageCount,
    // Only about SUBFOLDERS: a loose bank is what saves the all-excluded case.
    allExcluded: subs.length > 0 && subs.every((s) => skip.has(s.name)),
  }
}

/** The warning shown when every subfolder is ticked off, or null. Says which of
 *  the two outcomes it is — a loose bank, or a refusal — so the button is never
 *  pressed on a guess. */
export function allExcludedWarning(plan, { loose = 0, includeLoose = true, splitBanks = true } = {}) {
  if (!plan?.allExcluded) return null
  if (loose > 0 && includeLoose) {
    if (!splitBanks) return 'Every subfolder is excluded. Only loose root images will be included in this bank.'
    return 'Every subfolder is excluded. Only the loose root images will become a '
      + 'bank — nothing from the excluded folders is imported.'
  }
  return 'Every subfolder is excluded and there is nothing left to import. '
    + 'Select at least one subfolder, or include loose images.'
}
