import assert from 'node:assert/strict';
import test from 'node:test';
import { cropDisplayBox, dragCropBox, readCropSourceSize, roundCropBox } from './cropGeometry.js';

test('preview metadata keeps exact upright dimensions with an odd aspect ratio', () => {
  assert.deepEqual(readCropSourceSize('3025x4033'), { W: 3025, H: 4033 });
  for (const value of [null, '0x4033', '3025x0', '3025.5x4033', '9007199254740992x4033']) {
    assert.equal(readCropSourceSize(value), null);
  }
});

test('the same visual move on a phone and desktop produces the same source-pixel box', () => {
  const size = readCropSourceSize('3025x4033');
  const start = { x: 605, y: 807, w: 1210, h: 1613 };
  for (const [width, height] of [[300, 400], [750, 1000]]) {
    const drag = { start, sx: 10, sy: 20, width, height };
    const box = dragCropBox(drag, 10 + width / 10, 20 + height / 5, size, null);
    assert.deepEqual(roundCropBox(box), { x: 908, y: 1614, w: 1210, h: 1613 });
    assert.equal(cropDisplayBox(box, size).width, 0.4);
  }
});

test('resizing maps each viewport axis to source pixels and clamps at the source edge', () => {
  const size = readCropSourceSize('3025x4033');
  const drag = {
    start: { x: 300, y: 400, w: 1210, h: 1613 },
    edges: { right: true, bottom: true },
    sx: 0, sy: 0, width: 300, height: 400,
  };
  const box = dragCropBox(drag, 60, 400, size, null);
  assert.deepEqual(roundCropBox(box), { x: 300, y: 400, w: 1815, h: 3633 });
  const display = cropDisplayBox(box, size);
  assert.equal(display.top + display.height, 1);
});

test('a fixed ratio holds the center opposite a middle handle', () => {
  const start = { x: 700, y: 900, w: 800, h: 800 };
  const drag = { start, edges: { left: true }, sx: 100, sy: 100, width: 300, height: 400 };
  const box = dragCropBox(drag, 80, 100, { W: 3000, H: 4000 }, 1);
  assert.deepEqual(box, { x: 500, y: 800, w: 1000, h: 1000 });
});
