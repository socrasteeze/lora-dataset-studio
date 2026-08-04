/* Can the SELECTED machine run this pass?
 *
 * The original bug: the Launch dialog answered with `|| remote` — a truthy
 * device id and nothing else — so a peer that had already reported
 * `bank_scoring: false` got ✨ Score ticked FOR the user, staged the whole bank
 * over the network, and died on the first image as a mid-pipeline step error.
 *
 * What changed on 2026-08-04: the peer verdict is no longer recomputed here
 * from a second copy of the capability map. The server computes it with the
 * SAME function the launch route uses (`bank_remote.device_pass_gate`) and
 * ships it on the device as `device.passes`. So the two source-parsing tests
 * that used to live here — one scraping `PASS_PEER_CAPS` out of
 * `bank_remote.py`, one scraping `LOCAL_ONLY_STEPS` out of
 * `image_bank_service.py` — are gone, because there is no longer a second copy
 * to pin. Those greps were also brittle in a way worth remembering: a
 * reformat, an inline comment or a `# noqa` inside either literal would have
 * broken them without any behaviour changing.
 *
 * The precedence itself is now pinned on the Python side, in
 * `backend/tests/test_pass_device_gate.py`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { stepGate } from './passDeviceGate.js';

/** A peer as `/api/cluster/devices` serialises it: verdicts already decided. */
const peer = (passes) => ({ id: 'p1', name: 'G18', local: false, passes });

const BLOCKED = (reason) => ({ ok: false, blocked: true, reason, warn: null });
const ALLOWED = { ok: true, blocked: false, reason: null, warn: null };
const UNKNOWN = (warn) => ({ ok: true, blocked: false, reason: null, warn });

test('a blocked verdict blocks the checkbox and carries its reason through', () => {
  const g = stepGate('score', {
    device: peer({ score: BLOCKED('G18 reports no bank-scoring') }),
  });
  assert.equal(g.blocked, true);
  assert.equal(g.ok, false);
  assert.match(g.reason, /G18/);
  assert.match(g.reason, /bank-scoring/);
});

test('an allowed verdict allows it', () => {
  assert.deepEqual(stepGate('faces', { device: peer({ faces: ALLOWED }) }),
    { ok: true, blocked: false });
});

test('a peer that has not reported warns but does not block', () => {
  // The polarity lives on the server now, but the dialog must still RENDER it:
  // an unknown peer is a note, never a wall. Blocking on silence would make a
  // freshly joined peer unusable from the UI while the hub ran its jobs happily.
  const g = stepGate('framing', {
    device: peer({ framing: UNKNOWN('G18 hasn’t reported what it can run yet') }),
  });
  assert.equal(g.blocked, false);
  assert.equal(g.ok, true);
  assert.match(g.warn, /hasn’t reported/);
});

test('a step the server does not gate is allowed, never invented as blocked', () => {
  // scan / auto_reject read this machine's database. The server sends no
  // verdict for them at all, and a picker that guessed "blocked" from a missing
  // key would disable work the launch route runs happily.
  const device = peer({ score: BLOCKED('G18 reports no bank-scoring') });
  for (const key of ['scan', 'auto_reject']) {
    assert.equal(stepGate(key, { device }).blocked, false, `${key} was blocked`);
  }
});

test('a device list with no verdicts at all falls back to allowed', () => {
  // The safe direction for a picker is to be no MORE restrictive than the
  // submit path, which re-checks every step and refuses with the real reason.
  const device = { id: 'p1', name: 'G18', local: false };
  assert.deepEqual(stepGate('score', { device }), { ok: true, blocked: false });
});

test('same shot follows Score rather than the device', () => {
  // Stage 2 reuses Score's embeddings but always runs HERE, so it follows
  // Score's verdict — and when there are none it declines itself, which the
  // bank card renders as a stated prerequisite, not as a fault.
  const blocked = peer({ score: BLOCKED('G18 reports no bank-scoring') });
  assert.equal(stepGate('semantic_dedup', { device: blocked }).ok, false);
  assert.equal(stepGate('semantic_dedup', { device: blocked }).blocked, false,
    'never blocked by the device — it runs on this machine either way');
  assert.equal(stepGate('semantic_dedup', { device: peer({ score: ALLOWED }) }).ok, true);
});

test('this machine keeps the old local verdict and is never blocked', () => {
  // The LOCAL question — is this pass's tool installed HERE — is still answered
  // client-side, from the caps blob the page already holds. It never had a
  // second copy on the server, so it was never part of the duplication.
  const ctx = { caps: { bank_scoring: true, face_scoring: false }, visionReady: false };
  assert.deepEqual(stepGate('score', ctx), { ok: true, blocked: false });
  assert.deepEqual(stepGate('faces', ctx), { ok: false, blocked: false });
  assert.deepEqual(stepGate('framing', ctx), { ok: false, blocked: false });
  // …including when the picker hands back the local row rather than null.
  assert.equal(stepGate('score', { ...ctx, device: { id: 'local', local: true } }).blocked,
    false);
});

test('a local-only pass is blocked by the server for any peer', () => {
  // 🔖 Tags cannot travel. The verdict now arrives from the server, which is
  // what makes the QUEUE path refuse it too — that path never checked
  // LOCAL_ONLY_STEPS at all before this moved into one function.
  const g = stepGate('tags', {
    device: peer({ tags: BLOCKED('G18 can’t run this — it only runs on this machine') }),
  });
  assert.equal(g.blocked, true);
  assert.match(g.reason, /only runs on this machine/);
});
