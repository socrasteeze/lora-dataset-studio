// THE regression that matters for the single-box editable prompts: a box that
// SHOWS the shipped default must never persist a COPY of it. A stored copy would
// silently pin that user to today's wording — every later improvement to the
// built-in prompt would stop reaching them, with nothing in the UI saying so.
// The backend contract is literal: face_variations.get_identity_prompt only
// honours a NON-BLANK override, and config.DEFAULTS ships each string as ''.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePromptOverride, isFollowingDefault, promptBoxText,
  IDENTITY_PROMPT_FIELDS, EXTRA_REF_PROMPT_KEYS, activeExtraRefPromptKey,
} from './promptOverride.js';

const DEF = 'Keep the exact same face as the reference photo.';

test('the shipped default typed back verbatim is stored as "" (no frozen copy)', () => {
  assert.equal(normalizePromptOverride(DEF, DEF), '');
  assert.equal(isFollowingDefault(DEF, DEF), true);
});

test('surrounding whitespace alone is not an override', () => {
  assert.equal(normalizePromptOverride(`\n  ${DEF}  \n`, DEF), '');
  assert.equal(normalizePromptOverride('   ', DEF), '');
  assert.equal(normalizePromptOverride('', DEF), '');
  assert.equal(normalizePromptOverride(null, DEF), '');
  assert.equal(normalizePromptOverride(undefined, DEF), '');
});

test('a real edit is stored verbatim, including its own whitespace', () => {
  const edited = `${DEF} Keep the hairstyle too.`;
  assert.equal(normalizePromptOverride(edited, DEF), edited);
  assert.equal(isFollowingDefault(edited, DEF), false);
  // an INTERNAL difference is a real override even if it only adds a space
  assert.equal(normalizePromptOverride('Keep the  exact same face.', 'Keep the exact same face.'),
    'Keep the  exact same face.');
});

test('a missing default never turns text into "" (nothing to compare against)', () => {
  assert.equal(normalizePromptOverride('my prompt', ''), 'my prompt');
  assert.equal(normalizePromptOverride('my prompt', undefined), 'my prompt');
  // and blank stays blank
  assert.equal(normalizePromptOverride('', ''), '');
});

test('the box always displays the text actually in use', () => {
  assert.equal(promptBoxText('', DEF), DEF);          // following the default -> show it
  assert.equal(promptBoxText(null, DEF), DEF);
  assert.equal(promptBoxText('mine', DEF), 'mine');   // override -> show the override
  assert.equal(promptBoxText('', ''), '');
});

test('Reset (onChange("")) round-trips back to following the default', () => {
  const stored = normalizePromptOverride('something custom', DEF);
  assert.notEqual(stored, '');
  const reset = normalizePromptOverride('', DEF);
  assert.equal(reset, '');
  assert.equal(promptBoxText(reset, DEF), DEF);
});

test('field metadata keeps the persisted config keys', () => {
  assert.deepEqual(IDENTITY_PROMPT_FIELDS.map((f) => f.key),
    ['face_single', 'face_multi', 'klein_identity']);
  for (const f of IDENTITY_PROMPT_FIELDS) {
    assert.ok(f.id && f.label && f.desc && Array.isArray(f.engines));
  }
  // Divergence 1: upstream also requires every field to declare at least one
  // consumer. The KEYS stay here — they are persisted config, and an install
  // that already wrote them keeps them readable — but with API_PROMPT_ENGINES
  // empty the two API locks declare NO consumer, which is the honest answer:
  // nothing on this fork reads them. Only the local lock names engines, and it
  // names BOTH of them.
  for (const key of ['face_single', 'face_multi'])
    assert.deepEqual(IDENTITY_PROMPT_FIELDS.find((f) => f.key === key).engines, []);
  assert.deepEqual(
    IDENTITY_PROMPT_FIELDS.find((f) => f.key === 'klein_identity').engines,
    ['klein', 'krea']);
});

test('the Extra-refs modal covers BOTH engine families, not just the API one', () => {
  // Klein ignores face_multi entirely (wrap_variation_klein -> klein_identity),
  // so a modal editing only face_multi would be a no-op for Klein users.
  assert.deepEqual(EXTRA_REF_PROMPT_KEYS, ['face_multi', 'klein_identity']);
});

test('the "used by your current engine" badge follows the selected generator', () => {
  // Divergence 1: upstream maps its two cloud ids to face_multi. Here
  // API_PROMPT_ENGINES is empty, so EVERY id resolves to the local lock —
  // including a legacy cloud tag still sitting on an old row. That is the point:
  // no engine on this fork reads face_multi, so badging it would send a user to
  // edit a box that cannot change a single one of their images.
  assert.equal(activeExtraRefPromptKey('nanobanana'), 'klein_identity');
  assert.equal(activeExtraRefPromptKey('chatgpt'), 'klein_identity');
  assert.equal(activeExtraRefPromptKey('klein'), 'klein_identity');
  assert.equal(activeExtraRefPromptKey('krea'), 'klein_identity');
  // Divergence 1: nothing stored yet MIRRORS this fork's DEFAULT_ENGINE
  // ('klein'), not upstream's 'nanobanana'. Taking upstream's default badged
  // face_multi — an API-engine prompt this fork never surfaces and no local
  // generation reads — so a user who had not yet opened the Generate panel was
  // pointed at a box that could not affect their images.
  assert.equal(activeExtraRefPromptKey(''), 'klein_identity');
  assert.equal(activeExtraRefPromptKey(null), 'klein_identity');
  assert.equal(activeExtraRefPromptKey(undefined), 'klein_identity');
  // ...and any other value is Klein (it is "neither API engine")
  assert.equal(activeExtraRefPromptKey('legacy-engine'), 'klein_identity');
});
