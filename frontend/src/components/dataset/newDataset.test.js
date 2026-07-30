import assert from 'node:assert/strict';
import test from 'node:test';

import { canCreateDataset, triggerAlreadyUsed, triggerWarning } from './newDataset.js';

/* ── the creation rule, per kind ───────────────────────────────────────────── */

test('a character needs a name and a trigger', () => {
  assert.equal(canCreateDataset({ name: 'Emma', trigger: 'zchar_emma' }), true);
  assert.equal(canCreateDataset({ name: '', trigger: 'zchar_emma' }), false);
  assert.equal(canCreateDataset({ name: 'Emma', trigger: '' }), false);
});

test('a style needs NO trigger — its token is internal', () => {
  // The server keeps a `zsty_<id>` for run/LoRA filenames; the user never types
  // it, so demanding one here would be stricter than POST /api/dataset/create.
  assert.equal(canCreateDataset({ name: 'Ink wash', trigger: '', kind: 'style' }), true);
  assert.equal(canCreateDataset({ name: '', trigger: '', kind: 'style' }), false);
});

test('a concept needs the description the captions will omit', () => {
  const base = { name: 'Cim', trigger: 'cim_act', kind: 'concept' };
  assert.equal(canCreateDataset(base), false);
  assert.equal(canCreateDataset({ ...base, conceptDesc: 'two people embracing' }), true);
  // …and it still needs a trigger, unlike a style.
  assert.equal(canCreateDataset({ ...base, trigger: '', conceptDesc: 'x' }), false);
});

test('an unknown or missing kind reads as a character, on both surfaces', () => {
  // normalize_kind stores NULL for character, so '' / null / 'character' /
  // nonsense must all behave identically — the promote dialog sends no kind at
  // all, and it must not accidentally get the style exemption.
  for (const kind of [undefined, null, '', 'character', 'CHARACTER', 'nonsense']) {
    assert.equal(canCreateDataset({ name: 'A', trigger: 't', kind }), true, String(kind));
    assert.equal(canCreateDataset({ name: 'A', trigger: '', kind }), false, String(kind));
  }
});

test('whitespace is not a value', () => {
  assert.equal(canCreateDataset({ name: '   ', trigger: 't' }), false);
  assert.equal(canCreateDataset({ name: 'A', trigger: '   ' }), false);
  assert.equal(canCreateDataset({
    name: 'A', trigger: 't', kind: 'concept', conceptDesc: '  ',
  }), false);
});

test('it answers a strict boolean, and never throws on junk', () => {
  // The inline version evaluated to '' for a blank name. Both consumers coerce,
  // but a rule worth testing is worth asserting false against.
  assert.strictEqual(canCreateDataset({ name: '', trigger: '' }), false);
  assert.strictEqual(canCreateDataset({}), false);
  assert.strictEqual(canCreateDataset(), false);
});

/* ── the advisory trigger collision ────────────────────────────────────────── */

const DATASETS = [
  { id: 3, name: 'Emma', trigger_word: 'zchar_emma' },
  { id: 7, name: 'Ink wash', trigger_word: 'zsty_7' },
];

test('a taken trigger is found, trimmed and case-insensitively', () => {
  assert.equal(triggerAlreadyUsed('zchar_emma', DATASETS).id, 3);
  assert.equal(triggerAlreadyUsed('  ZCHAR_EMMA  ', DATASETS).id, 3);
});

test('a free trigger, a blank one and a missing list are all null', () => {
  assert.equal(triggerAlreadyUsed('zchar_nobody', DATASETS), null);
  assert.equal(triggerAlreadyUsed('', DATASETS), null);
  assert.equal(triggerAlreadyUsed('   ', DATASETS), null);
  assert.equal(triggerAlreadyUsed('zchar_emma', null), null);
  assert.equal(triggerAlreadyUsed('zchar_emma', []), null);
});

test('a row with no trigger never matches a blank-ish query', () => {
  assert.equal(triggerAlreadyUsed('x', [{ id: 1, name: 'A' }]), null);
});

test('the warning names the clash but does NOT claim training will fail', () => {
  // It is an exact-string match over a compound key (trigger + base + recipe),
  // so overclaiming would be wrong — two datasets on different bases are legal.
  const w = triggerWarning('zchar_emma', DATASETS);
  assert.match(w, /already the trigger of “Emma”/);
  assert.match(w, /AND the same base model/);
  assert.match(w, /change it later/);
  assert.equal(triggerWarning('zchar_free', DATASETS), null);
});
