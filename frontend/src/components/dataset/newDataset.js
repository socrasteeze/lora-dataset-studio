/* Creating a dataset — the rule, in one place, testable.
 *
 * This lived inline in NewDatasetForm's JSX as a single boolean expression with a
 * comment claiming it "Mirrors the server rule EXACTLY". It did. The problem is
 * that a rule mirroring a server rule from inside a render function is a rule
 * nothing tests and nothing stops from drifting — and the moment a SECOND
 * creation surface appeared (⬆ Promote → 🆕 A new dataset, which creates the
 * dataset and promotes into it in one click) there were two copies of it.
 *
 * So it moved here, with the reasoning it used to carry:
 *
 *   name is ALWAYS required;
 *   trigger_word is required for character/concept — it is the token that
 *     summons them — but NOT for style, where the server keeps an internal
 *     `zsty_<id>` purely for run/LoRA filenames and the user never types it;
 *   a concept must state what the captions omit, because the inverted-caption
 *     logic has nothing to bind the trigger to otherwise.
 *
 * Server side: POST /api/dataset/create (`not name or (not trigger and kind !=
 * 'style')`) plus create_dataset's own `concept_desc required for a concept
 * dataset`.
 */

import { normalizeKindLabel } from './datasetKindSwitch.js';

/** May a dataset be created from these fields? Strict boolean.
 *
 *  The inline version evaluated to `''` for a blank name (`name.trim() && …`).
 *  Both consumers coerce, so nothing changes on screen — but a rule worth
 *  testing is worth asserting `false` against. */
export function canCreateDataset({ name, trigger, kind, conceptDesc } = {}) {
  const k = normalizeKindLabel(kind);
  if (!String(name || '').trim()) return false;
  if (k === 'concept' && !String(conceptDesc || '').trim()) return false;
  // Style is the exemption, not an oversight: its token is internal.
  if (k !== 'style' && !String(trigger || '').trim()) return false;
  return true;
}

/** The dataset already using this trigger word, or null.
 *
 *  Advisory only, and the caller must keep it that way. Two datasets MAY share a
 *  trigger: the collision the app really refuses is the training RUN NAME —
 *  trigger + base model + recipe (lora_training.find_run_collision) — so two
 *  datasets on different bases are legal and the queue guard allows them.
 *  Refusing here would be a stricter rule than POST /api/dataset/create, which
 *  is exactly the drift this file exists to end.
 *
 *  It is worth surfacing anyway because the real refusal arrives LATE, at
 *  training-queue time, and the fix it asks for ("change the trigger_word") is
 *  expensive by then — renaming propagates to deployed LoRAs, run folders,
 *  exports and job configs. */
export function triggerAlreadyUsed(trigger, datasets) {
  const t = String(trigger || '').trim().toLowerCase();
  if (!t) return null;
  return (datasets || []).find(
    (d) => String(d?.trigger_word || '').trim().toLowerCase() === t) || null;
}

/** The warning sentence for a taken trigger, or null.
 *
 *  Hedged on purpose: this is an exact-string match over a compound key, so it
 *  must not claim the training WILL fail — only that it would if both datasets
 *  used the same base model. */
export function triggerWarning(trigger, datasets) {
  const clash = triggerAlreadyUsed(trigger, datasets);
  if (!clash) return null;
  return `“${String(trigger).trim()}” is already the trigger of “${clash.name}”. `
    + 'Two datasets with the same trigger AND the same base model cannot both be '
    + 'trained. You can change it later in the dataset\'s settings, but a rename '
    + 'after training also renames its deployed LoRA and run folder.';
}
