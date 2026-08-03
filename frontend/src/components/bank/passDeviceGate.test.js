/* Can the SELECTED machine run this pass?
 *
 * The bug: the Launch dialog answered with `|| remote` — a truthy device id and
 * nothing else — so a peer that had already reported `bank_scoring: false` got
 * ✨ Score ticked FOR the user, staged the whole bank over the network, and died
 * on the first image as a mid-pipeline step error.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { LOCAL_ONLY_PASSES, PASS_PEER_CAPS, stepGate } from './passDeviceGate.js';

const peer = (capabilities) => ({ id: 'p1', name: 'G18', local: false, capabilities });

test('a peer that reports the stack missing BLOCKS the pass', () => {
  const g = stepGate('score', { device: peer({ bank_scoring: false }) });
  assert.equal(g.blocked, true);
  assert.equal(g.ok, false);
  assert.match(g.reason, /G18/);
  assert.match(g.reason, /bank-scoring/);
});

test('a peer that reports the stack present allows it', () => {
  assert.deepEqual(stepGate('faces', { device: peer({ face_scoring: true }) }),
    { ok: true, blocked: false });
});

test('a peer that has not reported warns but does not block', () => {
  // Polarity has to match the backend (bank_remote.peer_refusal): only an
  // EXPLICIT false refuses. Blocking on an empty blob would make a freshly
  // joined peer unusable from the UI while the hub ran its jobs happily.
  const g = stepGate('framing', { device: peer({}) });
  assert.equal(g.blocked, false);
  assert.equal(g.ok, true);
  assert.match(g.warn, /hasn’t reported/);
});

test('captions need only ONE engine — either one keeps it live', () => {
  for (const blob of [{ joycaption: true, ollama: false },
    { joycaption: false, ollama: true }]) {
    assert.equal(stepGate('caption', { device: peer(blob) }).blocked, false);
  }
  assert.equal(
    stepGate('caption', { device: peer({ joycaption: false, ollama: false }) }).blocked,
    true, 'both engines refused must block — the peer cannot caption at all');
});

test('the hub-only passes are never blocked by the device you pick', () => {
  // scan / auto_reject / semantic_dedup read this machine's database and
  // embeddings cache. A device cannot block work it never receives.
  const device = peer({ bank_scoring: false, face_scoring: false, ollama: false });
  for (const key of ['scan', 'auto_reject', 'semantic_dedup']) {
    assert.equal(stepGate(key, { device }).blocked, false, `${key} was blocked`);
  }
});

test('same shot follows Score rather than the device', () => {
  // It reuses Score's embeddings and runs HERE either way, so it tracks Score's
  // verdict — and when there are none it declines itself, which the bank card
  // renders as a stated prerequisite, not as a fault.
  const device = peer({ bank_scoring: false });
  assert.equal(stepGate('semantic_dedup', { device }).ok, false);
  assert.equal(stepGate('semantic_dedup', { device: peer({ bank_scoring: true }) }).ok, true);
});

test('this machine keeps the old local verdict and is never blocked', () => {
  const ctx = { caps: { bank_scoring: true, face_scoring: false }, visionReady: false };
  assert.deepEqual(stepGate('score', ctx), { ok: true, blocked: false });
  assert.deepEqual(stepGate('faces', ctx), { ok: false, blocked: false });
  assert.deepEqual(stepGate('framing', ctx), { ok: false, blocked: false });
  // …including when the picker hands back the local row rather than null.
  assert.equal(stepGate('score', { ...ctx, device: { id: 'local', local: true } }).blocked,
    false);
});

test('the pass→capability map matches the backend', () => {
  // Two copies of this map is exactly the client/server drift _peer_caption_kind
  // warns about in its own docstring. Pin them together.
  const py = fs.readFileSync(
    new URL('../../../../backend/app/services/bank_remote.py', import.meta.url), 'utf8');
  const block = py.slice(py.indexOf('PASS_PEER_CAPS = {'));
  const backend = {};
  for (const [, key, caps] of block.slice(0, block.indexOf('}')).matchAll(
    /^\s{4}'(\w+)': \(([^)]*)\)/gm)) {
    backend[key] = [...caps.matchAll(/'(\w+)'/g)].map((m) => m[1]);
  }
  assert.deepEqual(backend, PASS_PEER_CAPS);
});

test('the local-only pass list matches the backend', () => {
  // Same drift risk as the map above, with a nastier failure: a pass this list
  // forgets is offered for a peer, ticked by default, and refused only when the
  // whole queue is launched.
  const py = fs.readFileSync(
    new URL('../../../../backend/app/services/image_bank_service.py', import.meta.url), 'utf8');
  const line = py.slice(py.indexOf('LOCAL_ONLY_STEPS = ('));
  const backend = [...line.slice(0, line.indexOf(')')).matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(backend, LOCAL_ONLY_PASSES);
});

test('a local-only pass is blocked by ANY peer, whatever it reports', () => {
  // The opposite polarity to the map above, on purpose: no peer advertises the
  // tagger at all, so the permissive "silence means probably fine" rule would
  // wave every one of them through.
  for (const capabilities of [{}, { wd14: true }, { ollama: true }]) {
    const g = stepGate('tags', { device: peer(capabilities) });
    assert.equal(g.blocked, true);
    assert.match(g.reason, /only runs here/);
  }
});

test('locally, the tag pass follows the wd14 capability', () => {
  assert.deepEqual(stepGate('tags', { caps: { wd14: true } }), { ok: true, blocked: false });
  assert.deepEqual(stepGate('tags', { caps: {} }), { ok: false, blocked: false });
});
