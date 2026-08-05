/* One list of steps, and it is the server's.
 *
 * The taxonomy used to live in four places, two of them inside
 * `LaunchAllDialog.jsx` alone: a hardcoded key list for the gates, a separate
 * array for the rendering, and a third for which boxes start ticked. Adding a
 * step to one and not the others gave you a checkbox with no gate, or a
 * checkbox that did nothing because `_sanitize_pipeline_steps` would drop a key
 * the server does not know.
 *
 * What these pin is the direction each half fails in. They are opposite on
 * purpose, and both directions are the safe one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { FALLBACK_ORDER, buildSteps, defaultChecked } from './pipelineSteps.js';

test('the order comes from the server, not from this file', () => {
  const steps = buildSteps(['caption', 'scan']);
  assert.deepEqual(steps.map((s) => s.key), ['caption', 'scan']);
  assert.equal(steps[0].label, '🏷️ Caption');
});

test('a step the server does not publish is not offered', () => {
  // A checkbox for it could only ever do nothing: the submit route drops any
  // key that is not in PIPELINE_STEPS.
  const keys = buildSteps(['scan', 'score']).map((s) => s.key);
  assert.deepEqual(keys, ['scan', 'score']);
  assert.equal(keys.includes('caption'), false);
});

test('a step with no copy still renders, under its own key', () => {
  // A missing sentence is a bad outcome. A step that silently vanishes from the
  // dialog is a worse one — nobody would know to look for it.
  const [step] = buildSteps(['some_new_pass']);
  assert.equal(step.key, 'some_new_pass');
  assert.equal(step.label, 'some_new_pass');
  assert.equal(step.desc, '');
});

test('no published list falls back to a usable order, never to nothing', () => {
  // An older backend, or a probe that could not import the bank service.
  for (const empty of [undefined, null, []]) {
    assert.deepEqual(buildSteps(empty).map((s) => s.key), FALLBACK_ORDER);
  }
});

test('every step carries its own prerequisite name, or none', () => {
  const byKey = Object.fromEntries(buildSteps(FALLBACK_ORDER).map((s) => [s.key, s]));
  assert.equal(byKey.score.needs, 'Bank scoring extra');
  // scan and auto_reject read this machine's database and need no tool at all.
  assert.equal('needs' in byKey.scan, false);
  assert.equal('needs' in byKey.auto_reject, false);
});

test('captioning starts unticked, everything else ready starts ticked', () => {
  // Caption is the slowest by a wide margin and the one people most often run
  // separately. An overnight Launch-all must not quietly commit to it.
  const steps = buildSteps(FALLBACK_ORDER);
  const ready = Object.fromEntries(steps.map((s) => [s.key, true]));
  const checked = defaultChecked(steps, ready);
  assert.equal(checked.has('caption'), false);
  assert.equal(checked.has('score'), true);
  assert.equal(checked.size, steps.length - 1);
});

test('a step whose tool is not ready does not start ticked', () => {
  const steps = buildSteps(['scan', 'score']);
  const checked = defaultChecked(steps, { scan: true, score: false });
  assert.deepEqual([...checked], ['scan']);
});
