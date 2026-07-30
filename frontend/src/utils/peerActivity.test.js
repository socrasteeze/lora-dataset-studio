/* A compute peer ran an hour of someone else's GPU work with nothing on screen
   saying so. These pin the two surfaces that fix it — the header chip and the
   browser tab title — including the cases where the state is partial, because a
   flag that lies is worse than no flag. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PEER_ACTIVITY, isPeerWorking, normalizePeerActivity,
  peerChipLabel, peerChipTitle, peerTabTitle,
} from './peerActivity.js';

const BASE = 'LoRA Dataset Studio';

test('normalize: junk or an unreachable endpoint reads as not busy', () => {
  assert.deepEqual(normalizePeerActivity(null), EMPTY_PEER_ACTIVITY);
  assert.deepEqual(normalizePeerActivity('nope'), EMPTY_PEER_ACTIVITY);
  assert.equal(normalizePeerActivity({}).busy, false);
  // Only a real boolean true counts — a truthy string must not light the header.
  assert.equal(normalizePeerActivity({ role: 'peer', busy: 'yes' }).busy, false);
  assert.equal(normalizePeerActivity({ role: 'peer', busy: 1 }).busy, false);
});

test('normalize: empty strings collapse to null, not to ""', () => {
  const a = normalizePeerActivity({ role: 'peer', busy: true, kind: '', phase: '' });
  assert.equal(a.kind, null);
  assert.equal(a.phase, null);
});

test('only a BUSY peer is working — role and busy both matter', () => {
  assert.equal(isPeerWorking({ role: 'peer', busy: true }), true);
  assert.equal(isPeerWorking({ role: 'peer', busy: false }), false);
  // A Primary running its own local pass is not "working for a Primary".
  assert.equal(isPeerWorking({ role: 'primary', busy: true }), false);
  assert.equal(isPeerWorking({ role: 'standalone', busy: true }), false);
  assert.equal(isPeerWorking(null), false);
});

test('the chip names the work, in the user\'s words not the wire\'s', () => {
  assert.equal(peerChipLabel({ role: 'peer', busy: true, kind: 'infer' }),
    'Working for Primary · a scoring pass');
  assert.equal(peerChipLabel({ role: 'peer', busy: true, kind: 'comfy' }),
    'Working for Primary · generating an image');
  assert.equal(peerChipLabel({ role: 'peer', busy: true, kind: 'training' }),
    'Working for Primary · a training run');
});

test('an unknown or missing kind still says the useful half', () => {
  // A kind this build does not know about must not blank the chip.
  assert.equal(peerChipLabel({ role: 'peer', busy: true, kind: 'newthing' }),
    'Working for Primary · a newthing job');
  assert.equal(peerChipLabel({ role: 'peer', busy: true }),
    'Working for Primary');
});

test('nothing renders when the peer is idle, or on a non-peer', () => {
  assert.equal(peerChipLabel({ role: 'peer', busy: false }), null);
  assert.equal(peerChipLabel({ role: 'primary', busy: true }), null);
  assert.equal(peerChipTitle({ role: 'peer', busy: false }), null);
});

test('the title/aria adds the phase, which is what moves in a long pass', () => {
  assert.equal(
    peerChipTitle({ role: 'peer', busy: true, kind: 'infer', phase: 'infer' }),
    'Working for Primary · a scoring pass (infer)');
  // No phase reported yet → the plain label, never "(null)".
  assert.equal(peerChipTitle({ role: 'peer', busy: true, kind: 'infer' }),
    'Working for Primary · a scoring pass');
});

test('the tab title leads with the bullet — a pinned tab shows little else', () => {
  const t = peerTabTitle({ role: 'peer', busy: true }, BASE);
  assert.ok(t.startsWith('●'), t);
  assert.match(t, /Working/);
  assert.match(t, /LoRA Dataset Studio$/);
});

test('an idle peer gets the title back UNCHANGED', () => {
  // The restore path: a tab still claiming "Working" after the pass ended is a
  // false statement, which is worse than having no indicator at all.
  assert.equal(peerTabTitle({ role: 'peer', busy: false }, BASE), BASE);
  assert.equal(peerTabTitle({ role: 'primary', busy: true }, BASE), BASE);
  assert.equal(peerTabTitle(null, BASE), BASE);
});

test('a missing base title degrades to the app name, never to "undefined"', () => {
  assert.equal(peerTabTitle(null, ''), 'LoRA Dataset Studio');
  assert.equal(peerTabTitle(null, undefined), 'LoRA Dataset Studio');
});
