import test from 'node:test';
import assert from 'node:assert/strict';

import { nextSelection } from './rangeSelect.js';

const order = ['a', 'b', 'c', 'd', 'e'];
const ids = (r) => [...r.selected].sort();

test('a plain click toggles the tile and anchors there', () => {
  const on = nextSelection(new Set(), order, 'b', null);
  assert.deepEqual(ids(on), ['b']);
  assert.equal(on.anchor, 'b');
  const off = nextSelection(on.selected, order, 'b', on.anchor);
  assert.deepEqual(ids(off), []);
  assert.equal(off.anchor, 'b');
});

test('shift-click adds the range from the anchor, in either direction', () => {
  const first = nextSelection(new Set(), order, 'b', null);
  const down = nextSelection(first.selected, order, 'd', first.anchor, { shift: true });
  assert.deepEqual(ids(down), ['b', 'c', 'd']);
  const up = nextSelection(new Set(['d']), order, 'a', 'd', { shift: true });
  assert.deepEqual(ids(up), ['a', 'b', 'c', 'd']);
});

test('shift-click keeps the anchor and never drops what was selected', () => {
  const r = nextSelection(new Set(['e']), order, 'c', 'a', { shift: true });
  assert.deepEqual(ids(r), ['a', 'b', 'c', 'e']);
  assert.equal(r.anchor, 'a');
  // A second shift-click extends from the SAME anchor, like a file manager.
  const r2 = nextSelection(r.selected, order, 'b', r.anchor, { shift: true });
  assert.deepEqual(ids(r2), ['a', 'b', 'c', 'e']);
  assert.equal(r2.anchor, 'a');
});

test('shift-click with no usable anchor is a plain toggle that anchors here', () => {
  const none = nextSelection(new Set(), order, 'c', null, { shift: true });
  assert.deepEqual(ids(none), ['c']);
  assert.equal(none.anchor, 'c');
  // The anchor left the visible order (other page, filter, delete).
  const gone = nextSelection(new Set(['c']), order, 'd', 'zz', { shift: true });
  assert.deepEqual(ids(gone), ['c', 'd']);
  assert.equal(gone.anchor, 'd');
});
