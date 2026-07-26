/* Which LOCAL engines a batch runs on, how the selected shots are shared
   between them, and what that costs (nothing — see below).
   PURE JS (no JSX) so node --test can import and exercise it directly.

   FORK DIVERGENCE 1 — LOCAL ENGINES ONLY
   --------------------------------------
   Upstream ships this module with five engines, three of them cloud APIs
   (Nano Banana / ChatGPT / OpenRouter). This fork generates exclusively on the
   user's own GPU, so the catalogue below is the LOCAL half only: Klein and
   Krea 2 Edit, both ComfyUI engines. `API_ENGINES` is kept as an EMPTY export
   rather than removed — it is the contract every "is this engine billable /
   NSFW-refusing / queued-behind" helper derives from, and an empty list makes
   those helpers answer correctly by construction instead of by special case.
   Re-adding an id to it would re-open the surface Divergence 1 closes; don't.

   WHY THIS FILE EXISTS
   --------------------
   The workspace used to generate with ONE engine, persisted as a plain string
   in localStorage `datasetGenerator`. With a second local engine there is a
   real choice to make — either to VARY the dataset (each shot goes to one
   engine) or to COMPARE the two on the same shots (both render every shot).

   The storage rule of this repo forbids renaming or re-typing a persisted key:
   `datasetGenerator` is read by the regenerate path (useDataset.js) and by the
   identity-prompt modal, which both want ONE engine. So the string key is
   KEPT, unchanged, as a mirror of the PRIMARY engine, and the list lives in a
   new key next to it. A profile that only ever knew the old key reads back as a
   one-engine selection — i.e. exactly the pre-Krea behaviour. A profile still
   holding a removed cloud engine in that key reads back as Klein, because
   `canonicalEngines` drops every id this catalogue does not list. */

/** Canonical engine order — drives the card order, the primary pick and the
 *  round-robin. Stable: it is also the order batches are BUILT in. */
export const ENGINES = ['klein', 'krea'];

/** Empty on this fork, permanently. See the divergence note above. */
export const API_ENGINES = [];

/** Engines that render on the user's own GPU through ComfyUI: free, slower,
 *  serialized on one GPU, and the only ones allowed to receive NSFW shots.
 *  Mirrors face_dataset_service.LOCAL_ENGINES — derive from this, never
 *  re-list it. On this fork it is every engine there is. */
export const LOCAL_ENGINES = ['klein', 'krea'];

export const ENGINE_LABELS = {
  klein: 'Klein',
  krea: 'Krea 2 Edit',
};

/* Per-engine accent colour. Deliberately NOT green: green already means
   "kept / already in the dataset / free" everywhere else in the app, so using
   it for "selected" made two different messages share one colour. Class
   strings are spelled out in full because Tailwind scans source text — never
   build them by concatenation. */
export const ENGINE_ACCENTS = {
  klein: {
    card: 'border-indigo-400/60 bg-indigo-500/15 ring-1 ring-indigo-400/40',
    title: 'text-indigo-200',
    text: 'text-indigo-300',
    icon: 'text-indigo-300',
    pill: 'bg-indigo-500/25 text-indigo-200',
    dot: 'bg-indigo-400',
  },
  /* Violet deliberately sits NEXT to Klein's indigo: both are local-GPU engines,
     and reading them as a pair is information, not a collision — the icon and
     the title carry the distinction. */
  krea: {
    card: 'border-violet-400/60 bg-violet-500/15 ring-1 ring-violet-400/40',
    title: 'text-violet-200',
    text: 'text-violet-300',
    icon: 'text-violet-300',
    pill: 'bg-violet-500/25 text-violet-200',
    dot: 'bg-violet-400',
  },
};

/** Pay-per-image rate. Every engine on this fork is local GPU time, hence
 *  free. The table is kept (rather than the cost helpers being deleted) so the
 *  shared UI shape still resolves and so a future local engine has an obvious
 *  place to declare itself free. */
export const ENGINE_RATES = { klein: 0, krea: 0 };

export const STORAGE_ENGINES = 'datasetGenerators';     // JSON list (new)
export const STORAGE_PRIMARY = 'datasetGenerator';      // legacy string mirror — NEVER renamed
export const STORAGE_MODE = 'datasetGeneratorMode';     // 'split' | 'all'

/** The engine a profile with no stored preference generates with. Klein is the
 *  fork's default engine: it is the one that needs no extra node pack. */
export const DEFAULT_ENGINE = 'klein';
export const MODES = ['split', 'all'];
/** Sharing the N selected shots between the engines (total = N) is the
 *  default: 'all' doubles the GPU time, so it is opt-in. */
export const DEFAULT_MODE = 'split';

/** Keep only real engine ids, de-duplicated, in canonical order. Anything else
 *  (a typo, a REMOVED CLOUD ENGINE, a non-string) is dropped rather than
 *  trusted — this is what quietly retires a stored 'nanobanana'. */
export function canonicalEngines(list) {
  const wanted = new Set(Array.isArray(list)
    ? list.filter((e) => typeof e === 'string').map((e) => e.toLowerCase())
    : []);
  return ENGINES.filter((e) => wanted.has(e));
}

/** The stored selection, with the legacy single-string key as fallback.
 *  Order of trust: the list key → the legacy string → the default.
 *  An EMPTY stored list is a real state (the user unchecked everything) and is
 *  returned as such; only a missing/unusable key falls through. */
export function readEngines(storage) {
  let raw = null;
  try { raw = storage?.getItem(STORAGE_ENGINES) ?? null; } catch { raw = null; }
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return canonicalEngines(parsed);
    } catch { /* corrupt JSON: fall through to the legacy key */ }
  }
  let legacy = null;
  try { legacy = storage?.getItem(STORAGE_PRIMARY) ?? null; } catch { legacy = null; }
  const fromLegacy = canonicalEngines([legacy]);
  if (fromLegacy.length) return fromLegacy;
  return [DEFAULT_ENGINE];
}

/** Persist the selection AND refresh the legacy mirror, so every existing
 *  single-engine reader (regenerate, the identity-prompt modal) keeps seeing a
 *  valid engine. The mirror is left untouched when nothing is selected — an
 *  empty selection generates nothing, and blanking it would make regenerate
 *  lose its engine. */
export function writeEngines(storage, engines) {
  const list = canonicalEngines(engines);
  try {
    storage?.setItem(STORAGE_ENGINES, JSON.stringify(list));
    if (list.length) storage?.setItem(STORAGE_PRIMARY, list[0]);
  } catch { /* private browsing / full storage: the in-memory state still works */ }
  return list;
}

export function readMode(storage) {
  let raw = null;
  try { raw = storage?.getItem(STORAGE_MODE); } catch { raw = null; }
  return MODES.includes(raw) ? raw : DEFAULT_MODE;
}

export function writeMode(storage, mode) {
  const value = MODES.includes(mode) ? mode : DEFAULT_MODE;
  try { storage?.setItem(STORAGE_MODE, value); } catch { /* ignore */ }
  return value;
}

/** The one engine single-engine consumers should use: first in canonical order.
 *  null when nothing is selected (callers keep their own fallback). */
export function primaryEngine(engines) {
  return canonicalEngines(engines)[0] || null;
}

/** Share `variations` between `engines`.
 *  - 'all'   : every engine renders EVERY shot (comparison — total = N × engines)
 *  - 'split' : round-robin, every shot goes to exactly ONE engine (variety —
 *              total = N, unchanged GPU time). 25 shots over 2 engines → 13/12.
 *  Returns [{ generator, variations }] in canonical order, with empty entries
 *  dropped (more engines than shots in split mode). One engine → a single entry
 *  holding all the shots, i.e. strictly the pre-Krea behaviour. */
export function distributeVariations(variations, engines, mode) {
  const shots = Array.isArray(variations) ? variations : [];
  const list = canonicalEngines(engines);
  if (!list.length || !shots.length) return [];
  if (mode === 'all') return list.map((generator) => ({ generator, variations: [...shots] }));
  const buckets = list.map((generator) => ({ generator, variations: [] }));
  shots.forEach((shot, i) => { buckets[i % list.length].variations.push(shot); });
  return buckets.filter((b) => b.variations.length);
}

/** Dispatch order for the server. Upstream sorts API batches first and the
 *  local ones last, because an API batch returns images while a local engine
 *  holds the single GPU. With LOCAL-ONLY engines every batch is local, so the
 *  sort is a no-op that keeps canonical order — kept so the shape (and the
 *  reasoning) survives if the ordering rule ever matters again. */
export function engineBatches(variations, engines, mode) {
  const batches = distributeVariations(variations, engines, mode);
  const local = (g) => (LOCAL_ENGINES.includes(g) ? 1 : 0);
  return [...batches].sort((a, b) => local(a.generator) - local(b.generator));
}

/** True when the run mixes a local GPU engine with at least one API engine —
 *  the case where the local shots visibly queue behind the API ones. Always
 *  false on this fork (no API engines), so the warning never renders. */
export function localQueuesBehindApi(engines) {
  const list = canonicalEngines(engines);
  return list.some((e) => LOCAL_ENGINES.includes(e))
    && list.some((e) => API_ENGINES.includes(e));
}

/** Every selected engine renders locally — the condition NSFW shots need.
 *  False on an empty selection: nothing selected renders nothing. */
export function localOnly(engines) {
  const list = canonicalEngines(engines);
  return list.length > 0 && list.every((e) => LOCAL_ENGINES.includes(e));
}

/** Back-compat alias — `kleinQueuesBehindApi` was the only name for this and is
 *  imported elsewhere; it now answers for BOTH local engines. */
export const kleinQueuesBehindApi = localQueuesBehindApi;

/** How many images the batch will produce: shots × multiplier, per engine. */
export function totalImages(shotCount, engines, mode, multiplier = 1) {
  const n = Math.max(0, Number(shotCount) || 0);
  const mult = Math.max(1, Number(multiplier) || 1);
  const list = canonicalEngines(engines);
  if (!list.length || !n) return 0;
  return (mode === 'all' ? n * list.length : n) * mult;
}

/** Dollar estimate for the batch — structurally always 0 here, because every
 *  rate in ENGINE_RATES is 0. Kept so the shared UI shape resolves and so the
 *  guard-rail below has one honest source of truth. */
export function estimateCost(shotCount, engines, mode, { multiplier = 1 } = {}) {
  const n = Math.max(0, Number(shotCount) || 0);
  const mult = Math.max(1, Number(multiplier) || 1);
  const list = canonicalEngines(engines);
  if (!list.length || !n) return 0;
  const rate = (engine) => ENGINE_RATES[engine] || 0;
  if (mode === 'all') return list.reduce((sum, e) => sum + n * mult * rate(e), 0);
  // split: round-robin share, same arithmetic as distributeVariations.
  return list.reduce((sum, e, i) => {
    const share = Math.floor(n / list.length) + (i < n % list.length ? 1 : 0);
    return sum + share * mult * rate(e);
  }, 0);
}

/** The engines that actually BILL for this run. Always empty on this fork, so
 *  the "this will cost $X" confirm never fires. */
export function billingEngines(engines) {
  return canonicalEngines(engines).filter((e) => (ENGINE_RATES[e] || 0) > 0);
}

/** Why Generate is unavailable, or null when it can run. The empty selection is
 *  a real, reachable state (every card unchecked), and it must SAY so instead of
 *  queueing an empty batch. `maxFanout` mirrors the server cap; it is read from
 *  /api/capabilities, never hardcoded here, and 0/undefined disables the check
 *  (the server stays the authority and refuses with its own message). */
export function generateBlockedReason({ engines, shotCount, mode, multiplier = 1, maxFanout = 0 }) {
  const list = canonicalEngines(engines);
  if (!list.length) return 'Pick at least one engine above';
  if (!Number(shotCount)) return 'Select at least one shot';
  const total = totalImages(shotCount, list, mode, multiplier);
  if (maxFanout > 0 && total > maxFanout) {
    return `${total} images is over the ${maxFanout}-per-batch limit — `
      + (mode === 'all' ? 'switch to Split, ' : '') + 'uncheck an engine or select fewer shots';
  }
  return null;
}
