/* The bank pipeline's steps — ONE list, and it is the server's.
 *
 * There used to be four copies of this taxonomy: `PIPELINE_STEPS` in
 * `image_bank_service.py` (the one that decides anything — anything missing
 * from it is dropped by `_sanitize_pipeline_steps`), `PASS_LABELS` in
 * `bank_remote.py`, and TWO more inside `LaunchAllDialog.jsx` alone — a
 * hardcoded key list for the gates and a separate array for the rendering,
 * plus a third for which boxes start ticked. A step added to one and not the
 * others produced a checkbox with no gate, or a checkbox that silently did
 * nothing because the server would drop it.
 *
 * So the ORDER and MEMBERSHIP now come from the server, on the capability blob
 * the dialog already holds (`caps.bank_pipeline_steps`) — no second request for
 * a constant. What lives here is the COPY: the label, the tool it needs, the
 * one-line description. That is UI text and belongs in the UI.
 *
 * The two halves fail in opposite, harmless directions on purpose:
 *   - a step the server publishes with no copy here still RENDERS, under its
 *     own key. A missing sentence is a worse outcome than a missing feature,
 *     but a step that vanishes from the dialog is invisible;
 *   - a copy entry the server does not publish is NOT offered, because a
 *     checkbox for it could only ever do nothing.
 */

/** Label, prerequisite name and description, per step. Copy only. */
export const STEP_COPY = {
  scan: {
    label: 'Scan quality',
    desc: 'Sharpness, noise, flatness, size + near-duplicate groups (CPU).',
  },
  auto_reject: {
    label: 'Auto-reject flagged',
  },
  score: {
    label: '✨ Score', needs: 'Bank scoring extra',
    desc: 'Aesthetic 1–10, NSFW, style groups (GPU).',
  },
  // Only present in the step list when the bank's semantic engine is SigLIP 2
  // (backend _SIGLIP2_PIPELINE_STEPS). The server decides that; this file only
  // has to know the words, which is the whole point of one registry.
  semantic_index: {
    label: 'Build SigLIP 2 semantic index', needs: 'SigLIP 2 Quality tool',
    desc: 'SigLIP 2 cache. CLIP data is kept.',
  },
  semantic_dedup: {
    label: '✂ Find crops & variants', needs: 'Semantic index',
    desc: 'Crops/variants of the same shot. Needs the index first.',
  },
  watermark: {
    label: 'Find watermarks', needs: 'Vision model',
    desc: 'GPU · watermarks and logos.',
  },
  faces: {
    label: 'Group by person', needs: 'Quality tools',
    desc: 'Person clusters, no reference photo.',
  },
  framing: {
    label: 'Classify framing', needs: 'Vision model',
    desc: 'GPU · face / bust / body / back.',
  },
  tags: {
    label: '🔖 Tags', needs: 'Image tagging (WD14)',
    desc: 'CPU · never writes captions. Runs here only.',
  },
  caption: {
    label: 'Caption', needs: 'Caption engine',
    desc: 'GPU · searchable, rides to the dataset.',
    // The only step that does NOT start ticked. It is the slowest by a wide
    // margin and the one people most often want to run separately, so an
    // overnight Launch-all should not quietly commit to it.
    defaultOff: true,
  },
}

/* Used only when the server publishes nothing — an older backend, or a probe
   that could not import the bank service. Keeping the dialog usable beats
   rendering an empty step list; the submit route re-validates either way. */
export const FALLBACK_ORDER = [
  'scan', 'auto_reject', 'score', 'semantic_dedup', 'watermark', 'faces',
  'framing', 'tags', 'caption',
]

/**
 * The steps to render, in the server's order.
 * @param {string[]|undefined} serverKeys `caps.bank_pipeline_steps`
 * @returns {Array<{key, label, needs?, desc, defaultOff?}>}
 */
export function buildSteps(serverKeys) {
  const keys = Array.isArray(serverKeys) && serverKeys.length
    ? serverKeys : FALLBACK_ORDER
  return keys.map((key) => ({
    key,
    // A step with no copy is still a step. Showing its bare key is ugly and
    // findable; dropping it is neither.
    label: STEP_COPY[key]?.label || key,
    desc: STEP_COPY[key]?.desc || '',
    ...(STEP_COPY[key]?.needs ? { needs: STEP_COPY[key].needs } : {}),
    ...(STEP_COPY[key]?.defaultOff ? { defaultOff: true } : {}),
  }))
}

/**
 * Which boxes start ticked: every step whose tool is ready on the machine that
 * will run it, except the ones marked `defaultOff`.
 * @param {Array} steps  from buildSteps
 * @param {Record<string, boolean>} ready  key → is its tool available
 */
export function defaultChecked(steps, ready) {
  return new Set(steps.filter((s) => !s.defaultOff && ready[s.key]).map((s) => s.key))
}
