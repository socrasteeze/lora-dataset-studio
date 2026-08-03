/* Reference-photo editing: which engines can edit, what the default pick is, and
   the small guards the modal relies on. PURE JS (no JSX) so node --test can
   import and exercise it directly — same split as engineSelection.js.

   The ✦ Edit modal sends the reference + a prompt to an engine and gets an edited
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

/** Ceiling on the dialog's own uploads, mirroring
 *  face_dataset_service.MAX_EDIT_REFERENCE_UPLOADS. It lives here rather than in
 *  the JSX so the per-engine limits below can be derived from it and tested. */
export const MAX_EDIT_REFS = 3;

/* ── What each engine consumes ──────────────────────────────────────────────
   Two things separate the engines from each other, and both have to reach the
   user BEFORE the click rather than after a three-minute render: which
   references it uses, and whether this install can run it. Every engine here is
   local and free, so there is no paid-lane branch to disclose. */

/** Reference images each engine actually consumes. Mirrors
 *  face_dataset_service.LOCAL_EDIT_REF_SUPPORT — the graphs are the authority:
 *   - 'dataset_only' : primary + the dataset's extra refs, chained as native
 *                      ReferenceLatent nodes (Klein). It has no slot for an
 *                      image added in this dialog, so those are refused with
 *                      Klein named, never silently dropped.
 *   - 'modal_one'    : primary + ONE image added in THIS dialog, and none of the
 *                      dataset's (Krea). Its `_b` slot was trained for a
 *                      different subject, so the dataset's pool — which holds
 *                      angles of the same face — is the wrong source for it.
 *                      Per-edit composition, not persistent identity.
 *  Unknown engines default conservatively to primary-only; this fork has no API
 *  engine whose transient-upload support could justify an 'all' fallback. */
export const EDIT_REF_SUPPORT = {
  klein: 'dataset_only',
  krea: 'modal_one',
};
export function editRefSupport(engine) {
  return EDIT_REF_SUPPORT[engine] || 'primary_only';
}

/** How many of THIS dialog's uploads an engine reads. 0 hides the picker for it —
 *  an input whose files are thrown away is worse than none. Mirrors
 *  face_dataset_service.MODAL_EDIT_REF_LIMITS. */
const MODAL_REF_LIMITS = { modal_one: 1 };
export function modalRefLimit(engine) {
  return MODAL_REF_LIMITS[editRefSupport(engine)] || 0;
}

/** True when this engine accepts the modal's own "+ Add reference images". */
export function acceptsExtraEditRefs(engine) {
  return modalRefLimit(engine) > 0;
}

/** How many uploads the picker may hold for the CURRENT local selection. */
export function maxEditRefsForBatch(engines) {
  return Array.from(engines || [])
    .reduce((best, engine) => Math.max(best, modalRefLimit(engine)), 0);
}

/** The picker stays as soon as ONE selected engine reads these bytes. Krea does
 *  (its single `_b` slot); Klein instead reads the dataset's persistent angles. */
export function acceptsExtraEditRefsForBatch(engines) {
  return Array.from(engines || []).some((engine) => acceptsExtraEditRefs(engine));
}

/** One sentence about where THIS engine's second reference comes from, or null
 *  when it takes everything (nothing to warn about). Shown at PICK time.
 *
 *  Naming the source is the whole point: the two local engines read opposite
 *  pools, and a user who reaches for the wrong one gets a worse render with no
 *  error to explain it. The "goes to the other engines" half also covers the
 *  case where switching engines shrinks or empties the picker — an unexplained
 *  disappearance reads as a bug. */
export function editRefNote(engine, { datasetExtraCount = 0 } = {}) {
  const support = editRefSupport(engine);
  const label = ENGINE_LABELS[engine] || engine;
  const n = Math.max(0, Number(datasetExtraCount) || 0);
  // Klein's second reference is PERSISTENT (it locks identity for every future
  // generation, not just this edit), so it lives on the dataset's reference card
  // and this dialog only points at it. With no angles yet the picker below shows
  // nothing for Klein, which reads as "it takes none" — hence the pointer.
  const where = 'Add angles with + on the reference card behind this dialog.';
  if (support === 'modal_one') {
    // Naming what the slot is FOR beats naming how big it is. The pack trained
    // it to place a second, DIFFERENT subject ("scene first, subject second"),
    // which is also WHY it reads this dialog and not the dataset's angles: that
    // pool holds more views of the same face, the one photo the slot mishandles.
    return `${label} uses your reference photo plus one image you add right here — its `
      + 'second slot was trained to hold a different subject, so use it to compose: '
      + 'another person, or a scene to place yours in. It does not read the dataset\'s '
      + 'extra angles; those are for the engines that lock identity with them.';
  }

  const uses = n > 0
    ? `${label} uses your reference plus the dataset's ${n} extra reference `
      + `photo${n === 1 ? '' : 's'}.`
    : `${label} uses your reference photo, and reads every extra angle the dataset `
      + `holds. ${where}`;
  return uses;
}

/** What this edit costs and how long it takes. Every engine here renders on the
 *  user's own GPU, so there is no price to state — and stating one anyway (as
 *  upstream's unconditional "Each edit is a paid API call" did on a local render)
 *  damages trust exactly as much as hiding a real one.
 *
 *  Takes upstream's batch signature so the modal can price a multi-engine pick,
 *  minus its paid branches: with API_ENGINES empty those are unreachable, and
 *  D1b's rule is to delete a dead API branch rather than let it look load-bearing. */
export function editCostNote(engineOrEngines) {
  const engines = Array.isArray(engineOrEngines)
    ? [...new Set(engineOrEngines)]
    : [engineOrEngines].filter(Boolean);
  if (!engines.length) return 'Select at least one engine to see its cost.';
  if (engines.length === 1) {
    const engine = engines[0];
    return `${ENGINE_LABELS[engine] || engine} renders on your own ComfyUI — no API key, no `
      + 'bill, nothing leaves your machine, so you can retry a prompt as often as you like. '
      + 'It queues behind any generation already running on your GPU.';
  }
  return `${engines.length} edits will run, all on your own ComfyUI — no API key, no bill, `
    + 'nothing leaves your machine. They queue one after another on your GPU, so the '
    + 'last result lands later than the first.';
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

/** Batch equivalent of editBlockedReason. Every selected engine must be runnable:
 * accepting a batch while one selected local engine is known to be unavailable
 * would promise a comparison the server cannot launch. */
export function editBatchBlockedReason(prompt, engines, options = []) {
  const selected = [...new Set(Array.from(engines || []))];
  if (!selected.length) return 'Select at least one engine';
  if (selected.some((engine) => !EDIT_ENGINES.includes(engine))) {
    return editEngineChoiceMessage();
  }
  const blocked = selected
    .map((engine) => options.find((option) => option.engine === engine)?.blocked)
    .filter(Boolean);
  if (blocked.length) return blocked.join(' · ');
  if (!prompt || !prompt.trim()) return 'Describe the edit first';
  return null;
}

/** Normalize the server's new per-engine candidate map while retaining the old
 * one-engine payload as a fallback. Selection order is preserved for a stable
 * comparison layout; unknown fields remain ignored. */
export function referenceEditCandidates(referenceEdit) {
  if (!referenceEdit) return [];
  const rawCandidates = referenceEdit.candidates;
  const keyed = {};
  if (Array.isArray(rawCandidates)) {
    for (const candidate of rawCandidates) {
      if (candidate?.engine) keyed[candidate.engine] = candidate;
    }
  } else if (rawCandidates && typeof rawCandidates === 'object') {
    for (const [engine, candidate] of Object.entries(rawCandidates)) {
      keyed[engine] = candidate || {};
    }
  }
  const order = [];
  const add = (engine) => {
    if (engine && !order.includes(engine)) order.push(engine);
  };
  if (Array.isArray(referenceEdit.engines)) referenceEdit.engines.forEach(add);
  Object.keys(keyed).forEach(add);
  if (!order.length) add(referenceEdit.engine);
  return order.map((engine) => {
    const candidate = keyed[engine] || {};
    const legacy = !rawCandidates && engine === referenceEdit.engine;
    return {
      engine,
      status: candidate.status || (legacy ? referenceEdit.status : 'running'),
      candidate_filename: candidate.candidate_filename
        || (legacy ? referenceEdit.candidate_filename : null),
      error: candidate.error || (legacy ? referenceEdit.error : null),
    };
  });
}

/** Return a saved exact-retry request only while it still belongs to the batch
 * shown by the server. A dataset id alone is not enough: another tab can replace
 * the batch while this tab retains prompt, engine and File objects in memory. */
export function retryRequestForReferenceEdit(request, referenceEdit) {
  const savedBatchId = typeof request?.batchId === 'string' ? request.batchId : '';
  const activeBatchId = typeof referenceEdit?.batch_id === 'string'
    ? referenceEdit.batch_id : '';
  return savedBatchId && activeBatchId && savedBatchId === activeBatchId
    ? request : null;
}

/** The modal's phase, DERIVED from the server's `reference_edit` payload object
 *  (not local state) so it restores correctly after a tab sleep or reload:
 *  'idle' (no pending edit / form), 'running', 'ready' (Before/After), 'failed'. */
export function editPhase(referenceEdit) {
  const s = referenceEdit?.status;
  if (s === 'running' || s === 'ready' || s === 'failed') return s;
  const candidates = referenceEditCandidates(referenceEdit);
  if (!candidates.length) return 'idle';
  if (candidates.some((candidate) => candidate.status === 'running')) return 'running';
  if (candidates.some((candidate) => candidate.status === 'ready')) return 'ready';
  return 'failed';
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
