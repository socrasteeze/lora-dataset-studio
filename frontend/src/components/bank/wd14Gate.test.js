import test from 'node:test';
import assert from 'node:assert/strict';
import { showTagFilters, tagsButtonLabel, tagsButtonState } from './wd14Gate.js';
import { wd14InstallState, WD14_ACTION, WD14_LABEL } from '../../utils/wd14Install.js';

test('a running pass outranks the capability — installing would not help', () => {
  const s = tagsButtonState({ capable: false, busyKind: 'score', scanned: 10 });
  assert.equal(s.disabled, true);
  assert.match(s.title, /score pass is already running/);
  assert.equal(s.blocked, false);          // not a capability problem
  assert.equal(s.setupRoute, null);
});

test('a missing capability outranks the empty-bank hint', () => {
  const s = tagsButtonState({ capable: false, scanned: 0 });
  assert.equal(s.blocked, true);
  assert.equal(s.setupRoute, '#/setup?step=quality');
  assert.match(s.title, /not installed/);
});

test('the server says WHICH half is missing, and the button repeats it', () => {
  // ✗ has two causes here and they are fixed in different places, so a generic
  // "not installed" would send half the users to the wrong one.
  const s = tagsButtonState({ capable: false, detail: 'model not downloaded (model.onnx)' });
  assert.match(s.reason, /model not downloaded/);
});

test('capsLoading keeps the button quiet instead of flashing "not installed"', () => {
  const s = tagsButtonState({ capable: undefined, capsLoading: true, scanned: 10 });
  assert.equal(s.blocked, false);
  assert.equal(s.disabled, false);
});

test('an unscanned bank is disabled with a hint, not marked broken', () => {
  const s = tagsButtonState({ capable: true, scanned: 0 });
  assert.equal(s.disabled, true);
  assert.equal(s.blocked, false);
  assert.match(s.title, /Scan the bank first/);
});

test('a ready, scanned bank runs', () => {
  const s = tagsButtonState({ capable: true, scanned: 40 });
  assert.equal(s.disabled, false);
  assert.match(s.title, /never writes captions/);
});

test('the label names the scope and counts only what is still in play', () => {
  assert.equal(tagsButtonLabel(null), '🔖 Tags');
  assert.equal(tagsButtonLabel({ total: 100, reject: 40 }), '🔖 Tags (60)');
  assert.equal(tagsButtonLabel({ total: 100, reject: 40, tagged: 0 }), '🔖 Tags (60)');
  assert.equal(tagsButtonLabel({ total: 100, reject: 40, tagged: 10 }), '🔖 Tags (50 new)');
});

test('"all done" is said out loud, so a no-op re-run is not a mystery', () => {
  assert.equal(tagsButtonLabel({ total: 60, reject: 0, tagged: 60 }),
    '🔖 Tags (all 60 done)');
});

test('the facet row appears only once the pass has tagged something', () => {
  assert.equal(showTagFilters({ tagged: 0 }), false);
  assert.equal(showTagFilters({ tagged: 5 }), true);
});

test('an active filter keeps the row visible — a filter you cannot see is the bug', () => {
  assert.equal(showTagFilters({ tagged: 0, activeTags: ['blonde_hair'] }), true);
});

test('install state: ready, loading, and the two ✗ reasons', () => {
  assert.equal(wd14InstallState({ capsLoading: true }).status, 'loading');
  assert.equal(wd14InstallState({ capable: true }).status, 'ready');

  const missing = wd14InstallState({ capable: false, detail: 'model not downloaded' });
  assert.equal(missing.status, 'installable');
  assert.equal(missing.canInstall, true);
  assert.equal(missing.action, WD14_ACTION);
  assert.equal(missing.label, WD14_LABEL);
  assert.match(missing.detail, /model not downloaded/);
  // The cost is stated BEFORE the click.
  assert.match(missing.detail, /400 MB/);
});

test('install state: an out-of-range Python is explained, not offered a doomed button', () => {
  const s = wd14InstallState({
    capable: false,
    python: { version: '3.13.1', ml_supported: false, ml_range: '3.10–3.12' },
  });
  assert.equal(s.status, 'unsupported_python');
  assert.equal(s.canInstall, false);
  assert.match(s.detail, /3\.10–3\.12/);
  assert.match(s.detail, /wd14\.python/);
});

test('install state: an unknown python probe must never hide the button', () => {
  assert.equal(wd14InstallState({ capable: false }).canInstall, true);
  assert.equal(wd14InstallState({ capable: false, python: {} }).canInstall, true);
});
