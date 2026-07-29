import test from 'node:test';
import assert from 'node:assert/strict';
import { CUDA_TORCH_DOWNLOAD, holdsTheGpu, scoreDeviceNote, scoreGpuHoldNote } from './bankScoreDevice.js';

test('a GPU pass says nothing — there is nothing to FIX', () => {
  // scoreDeviceNote is the "here is what is slow and here is the fix" note.
  // A GPU pass has no fix, so it stays out of it — what a GPU pass COSTS is a
  // separate sentence (scoreGpuHoldNote), not a change to this one.
  assert.equal(scoreDeviceNote({ device: 'cuda', gpu: true }), null);
});

test('no payload yet -> no note, never a flash of wrong advice', () => {
  assert.equal(scoreDeviceNote(null), null);
  assert.equal(scoreDeviceNote(undefined), null);
});

test('nothing is said while the scoring extra is not installed', () => {
  const cpu = { device: 'cpu', gpu: false, gpu_present: true, eta_minutes: 57 };
  assert.equal(scoreDeviceNote(cpu, false), null);   // the button already says "needs setup"
  assert.notEqual(scoreDeviceNote(cpu, true), null);
});

test('a machine with a card gets the warning AND the download size', () => {
  const n = scoreDeviceNote({ device: 'cpu', gpu: false, gpu_present: true, eta_minutes: 57 });
  assert.equal(n.tone, 'warn');
  assert.match(n.text, /57 minutes/);
  assert.match(n.text, /20×/);
  assert.ok(n.text.includes(CUDA_TORCH_DOWNLOAD), 'the 2.5 GB cost must be stated up front');
});

test('a machine WITHOUT a card is told how it is, not sold a CUDA install', () => {
  const n = scoreDeviceNote({ device: 'cpu', gpu: false, gpu_present: false, eta_minutes: 12 });
  assert.equal(n.tone, 'info');
  assert.match(n.text, /no NVIDIA GPU detected/);
  assert.ok(!n.text.includes(CUDA_TORCH_DOWNLOAD), 'never suggest a download it cannot use');
});

test('one minute is singular, and a missing estimate is simply omitted', () => {
  assert.match(scoreDeviceNote({ device: 'cpu', gpu_present: true, eta_minutes: 1 }).text,
    /About 1 minute for/);
  const none = scoreDeviceNote({ device: 'cpu', gpu_present: true, eta_minutes: null });
  assert.ok(!/About/.test(none.text));
});

test('holdsTheGpu is true only for a pass that really takes the card', () => {
  assert.equal(holdsTheGpu({ device: 'cuda', gpu: true }), true);
  assert.equal(holdsTheGpu({ device: 'cpu', gpu: false }), false);
  assert.equal(holdsTheGpu(null), false);
});

/* ── What a GPU pass costs the rest of the app ─────────────────────────────── */

test('a GPU pass states that it takes the card for its whole duration', () => {
  // Reported: ✨ Score "got stuck" after being pointed at ComfyUI's Python. It
  // had not — it had started holding the GPU-exclusive window, and every other
  // pass and queued bank then answered "GPU busy". Nothing on screen said the
  // interpreter switch had done that.
  const n = scoreGpuHoldNote({ device: 'cuda', gpu: true, borrowed: true });
  assert.equal(n.tone, 'info');
  assert.match(n.text, /ComfyUI is unloaded/);
  assert.match(n.text, /training run cannot start/);
  assert.match(n.text, /GPU busy/);
  assert.match(n.text, /Back to the app default/, 'the way out must be named');
});

test('a GPU pass in the app\'s own scoring env does not offer a picker it never used', () => {
  const n = scoreGpuHoldNote({ device: 'cuda', gpu: true, borrowed: false });
  assert.match(n.text, /in the scoring environment/);
  assert.ok(!/Back to the app default/.test(n.text));
});

test('a CPU pass holds nothing, so it says nothing here', () => {
  assert.equal(scoreGpuHoldNote({ device: 'cpu', gpu: false, gpu_present: true }), null);
  assert.equal(scoreGpuHoldNote(null), null);
  // …and nothing is said while the extra is not installed, same as the CPU note.
  assert.equal(scoreGpuHoldNote({ device: 'cuda', gpu: true }, false), null);
});
