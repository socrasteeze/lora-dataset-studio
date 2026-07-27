/* Reference-photo editing: which engines can edit, what the default pick is, and
   the small guards the modal relies on. PURE JS (no JSX) so node --test can
   import and exercise it directly — same split as engineSelection.js.

   The Edit modal sends the reference + a prompt to an engine and gets an edited
   candidate back. Upstream this was an API-only gesture, because the edit was a
   BLOCKING provider call and the local engines have no blocking call to make.
   That is no longer true: a local edit is queued on the same ComfyUI job queue as
   every other local render and answered by its completion callback.

   ON THIS FORK every engine is local (Divergence 1), so the whole feature is
   free: retrying a prompt five times costs nothing but GPU time. Upstream's
   paid-lane branches are DELETED here rather than left dead — with API_ENGINES
   empty they would each be dead in one fixed direction, which is exactly the
   Divergence-1b trap that has bitten this fork before. */
import {
  primaryEngine, readEngines, ENGINES, LOCAL_ENGINES, ENGINE_LABELS, DEFAULT_ENGINE,
} from './engineSelection.js';

/** Engines that can edit the reference — DERIVED from the canonical engine list,
 *  never a second hardcoded list. The server accepts exactly
 *  svc.editable_engines() on /ref/edit, and a private copy here is how the modal
 *  ends up offering what the route refuses (or, as happened upstream with BOTH
 *  local engines, hiding what the route would have accepted). Copied, not
 *  aliased, so a caller can't mutate the generation list through this one. */
export const EDIT_ENGINES = [...ENGINES];

/** The refusal shown for a non-editable engine, DERIVED from EDIT_ENGINES:
 *  "Pick Klein or Krea 2 Edit". Unreachable in practice (every engine this fork
 *  ships can edit) and kept as the guard for a client that sends something else —
 *  a stored legacy engine tag, most likely. */
export function editEngineNames() {
  const names = EDIT_ENGINES.map((e) => ENGINE_LABELS[e] || e);
  if (!names.length) return '';
  const last = names[names.length - 1];
  const head = names.slice(0, -1);
  return head.length ? `${head.join(', ')} or ${last}` : last;
}

export function editEngineChoiceMessage() {
  const names = editEngineNames();
  return names ? `Pick ${names}` : 'No image engine can edit the reference';
}

/** The engine the modal opens on: the workspace's PRIMARY generation engine when
 *  it can edit, else the first engine this install can actually run. Opening on a
 *  dead selection would make the modal's first impression a disabled button.
 *
 *  The fallback is RECOMPUTED for this fork, not inherited: upstream hardcodes one
 *  of its removed cloud engines here, an id that does not exist on this fork and
 *  would have made the modal open on something no route accepts. (FORK_NOTES merge
 *  diagnostic 10 — never read a default off upstream.) */
export function defaultEditEngine(storage, usable = null) {
  const ok = (e) => EDIT_ENGINES.includes(e) && (typeof usable !== 'function' || usable(e));
  const primary = primaryEngine(readEngines(storage));
  if (ok(primary)) return primary;
  return EDIT_ENGINES.find(ok) || DEFAULT_ENGINE;
}

/* ── What each engine consumes ──────────────────────────────────────────────
   Two things separate the engines from each other, and both have to reach the
   user BEFORE the click rather than after a three-minute render: which
   references it uses, and whether this install can run it. (Upstream has a third,
   cost — every engine here is free, so there is nothing to disclose.) */

/** Reference images each engine actually consumes. Mirrors
 *  face_dataset_service.LOCAL_EDIT_REF_SUPPORT — the graphs are the authority:
 *   - 'dataset_only' : primary + the dataset's extra refs, chained as native
 *                      ReferenceLatent nodes (Klein).
 *   - 'primary_only' : the reference and nothing else (Krea's edit patch takes
 *                      one source; what a second does to identity is unmeasured).
 *
 *  Upstream has a third value, 'all', for the API engines — they additionally
 *  took transient images uploaded in the modal. No engine here can: both local
 *  graphs want file PATHS, and the route refuses request-scoped bytes outright.
 *  So the modal has no "+ Add reference images" picker at all, and the unknown-
 *  engine default below is the CONSERVATIVE one rather than upstream's 'all' —
 *  defaulting to "takes everything" would promise a capability no engine has. */
export const EDIT_REF_SUPPORT = {
  klein: 'dataset_only',
  krea: 'primary_only',
};
export function editRefSupport(engine) {
  return EDIT_REF_SUPPORT[engine] || 'primary_only';
}

/** One sentence about which references this engine uses, shown at PICK time so
 *  the set of photos feeding the edit is never a surprise afterwards. */
export function editRefNote(engine, { datasetExtraCount = 0 } = {}) {
  const support = editRefSupport(engine);
  const label = ENGINE_LABELS[engine] || engine;
  const n = Math.max(0, Number(datasetExtraCount) || 0);
  if (support === 'dataset_only') {
    return n > 0
      ? `${label} uses your reference plus the dataset's ${n} extra reference `
        + `photo${n === 1 ? '' : 's'}.`
      : `${label} uses your reference photo (and any extra angles you add to the dataset).`;
  }
  return `${label} edits the main reference only — extra reference photos, including the `
    + "dataset's, are not used.";
}

/** What this edit costs and how long it takes. Every engine here renders on the
 *  user's own GPU, so there is no price to state — and stating one anyway (as
 *  upstream's unconditional "Each edit is a paid API call" did on a local render)
 *  damages trust exactly as much as hiding a real one. */
export function editCostNote(engine) {
  return `${ENGINE_LABELS[engine] || engine} renders on your own ComfyUI — no API key, no `
    + 'bill, nothing leaves your machine, so you can retry a prompt as often as you like. '
    + 'It queues behind any generation already running on your GPU.';
}

/** The line under Before/After. Upstream's claimed a refund that never existed;
 *  here there was never anything to refund. */
export function editKeepNote() {
  return 'Keep replaces the reference — this can’t be undone after you Keep it. It changes '
    + 'only future variations, not images already generated. Discarding costs you nothing '
    + '— it ran on your own GPU.';
}

/** Why an engine can't be picked on THIS install, or null when it can.
 *
 *  `reasonFor` is injected rather than imported so this file stays free of the
 *  engine-specific diagnostics: the modal passes the SAME function the generation
 *  panel uses (utils/localEngineReason.js), so one gap is never explained two
 *  different ways two clicks apart.
 *
 *  A non-local engine returns null — unreachable for a live engine here, but a
 *  stored legacy API tag must come back "no reason" rather than borrow a local
 *  engine's sentence and tell the user to download a weight for an engine this
 *  fork does not ship. Same rule localEngineUnavailableReason follows. */
export function editEngineBlockedBy(engine, { available = {}, reasonFor = null } = {}) {
  if (!LOCAL_ENGINES.includes(engine)) return null;
  if (available[engine]) return null;
  const reason = typeof reasonFor === 'function' ? reasonFor(engine) : null;
  return reason || `⚠ ${ENGINE_LABELS[engine] || engine} is not available on this install`;
}

/** The engines the modal actually renders, with their state.
 *  `comfyuiConfigured=false` (no ComfyUI at all) DROPS them instead of showing
 *  permanently dead buttons: on that install they are not a gap to fix from this
 *  modal, they are a product the user hasn't got. A CONFIGURED ComfyUI with a
 *  missing weight or node pack is the opposite — that gap is one action away, so
 *  the engine stays visible and says which action. */
export function editEngineOptions({ comfyuiConfigured = false, available = {},
                                    reasonFor = null } = {}) {
  return EDIT_ENGINES
    .filter(() => comfyuiConfigured)
    .map((engine) => {
      const blocked = editEngineBlockedBy(engine, { available, reasonFor });
      return { engine, label: ENGINE_LABELS[engine] || engine, blocked, usable: !blocked };
    });
}

/** Why the "Generate edit" button is disabled, or null when it can run. Two hard
 *  blocks: an engine this install can't run, and an empty prompt (the edit is
 *  free-form, but it needs SOMETHING). The engine reason comes FIRST — typing a
 *  prompt would not make a missing node pack appear. */
export function editBlockedReason(prompt, engine, engineBlocked = null) {
  if (!EDIT_ENGINES.includes(engine)) return editEngineChoiceMessage();
  if (engineBlocked) return engineBlocked;
  if (!prompt || !prompt.trim()) return 'Describe the edit first';
  return null;
}

/** The modal's phase, DERIVED from the server's `reference_edit` payload object
 *  (not local state) so it restores correctly after a tab sleep or reload:
 *  'idle' (no pending edit / form), 'running', 'ready' (Before/After), 'failed'. */
export function editPhase(referenceEdit) {
  const s = referenceEdit?.status;
  return (s === 'running' || s === 'ready' || s === 'failed') ? s : 'idle';
}

/** Advisory shown when a generation batch is live. A Keep is provably safe (the
 *  batch snapshotted the reference at launch), so this INFORMS, it does not block:
 *  the point is that editing changes only FUTURE batches. Returns null when no
 *  batch is running. `activity` is the live dataset-activity object (or null). */
export function batchLiveNote(activity) {
  return activity && activity.kind === 'generate'
    ? "A batch is running. Editing the reference won't change variations already "
      + 'generated or still in flight — only future batches use the edited photo.'
    : null;
}

// Re-exported so the modal imports one module for all edit constants. Upstream
// also re-exports API_ENGINES; it is empty here and nothing in the modal reads
// it, so it stays out rather than sitting as a dead reference.
export { LOCAL_ENGINES, ENGINE_LABELS };
