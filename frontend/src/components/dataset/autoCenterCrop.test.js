import assert from 'node:assert/strict';
import test from 'node:test';
import { autoCenterCrop } from './autoCenterCrop.js';

function contains(box, bounds, width, height) {
  assert.ok(box.x <= bounds[0] * width + 0.01);
  assert.ok(box.y <= bounds[1] * height + 0.01);
  assert.ok(box.x + box.w >= bounds[2] * width - 0.01);
  assert.ok(box.y + box.h >= bounds[3] * height - 0.01);
  assert.ok(box.x >= 0 && box.y >= 0);
  assert.ok(box.x + box.w <= width + 0.01 && box.y + box.h <= height + 0.01);
}

test('full-body framing removes blank margins while retaining the entire subject', () => {
  const bounds = [0.6, 0.15, 0.8, 0.85];
  const { box, edgeLimited } = autoCenterCrop(bounds, 1600, 1200);
  contains(box, bounds, 1600, 1200);
  assert.ok(box.w < 1600 && box.h < 1200);
  assert.ok(Math.abs(box.x + box.w / 2 - 1120) < 0.01);
  assert.ok(Math.abs(box.y + box.h / 2 - 600) < 0.01);
  assert.equal(edgeLimited, false);
});

test('a subject near an edge stays intact and reports the centering limit', () => {
  const bounds = [0, 0.2, 0.25, 0.8];
  const { box, edgeLimited } = autoCenterCrop(bounds, 1000, 1000);
  contains(box, bounds, 1000, 1000);
  assert.equal(box.x, 0);
  assert.equal(edgeLimited, true);
});

test('a compatible fixed ratio retains the subject', () => {
  const bounds = [0.35, 0.2, 0.65, 0.8];
  const { box } = autoCenterCrop(bounds, 1000, 1000, 3 / 4);
  contains(box, bounds, 1000, 1000);
  assert.ok(Math.abs(box.w / box.h - 3 / 4) < 0.0001);
});

test('a wide ratio cannot silently cut a full-body subject', () => {
  assert.throws(() => autoCenterCrop([0.4, 0.1, 0.6, 0.9], 1000, 1000, 16 / 9), /would cut the subject/);
});

test('invalid detection values never become a crop', () => {
  for (const bounds of [[0, 0, NaN, 1], [0, 0, 2, 1], [0.5, 0, 0.5, 1], null]) {
    assert.throws(() => autoCenterCrop(bounds, 1000, 1000));
  }
});
