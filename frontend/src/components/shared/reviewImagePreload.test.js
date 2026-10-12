import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewImagePreloader } from './reviewImagePreload.js';

test('nearby files load once and edited versions load separately', () => {
  const images = [];
  const warm = createReviewImagePreloader(() => {
    const image = { decode: () => Promise.resolve() };
    images.push(image);
    return image;
  });
  warm(['/file/1', '/file/2', '/file/2']);
  warm(['/file/1', '/file/2']);
  assert.equal(images.length, 2);
  warm(['/file/1?e=2', '/file/2']);
  assert.deepEqual(images.map((image) => image.src), ['/file/1', '/file/2', '/file/1?e=2']);
  warm(['/file/3']);
  warm(['/file/1']);
  assert.equal(images.length, 5, 'old decoded images are released outside the window');
});

test('failed warmups retry and old callbacks cannot evict a newer image', () => {
  const images = [];
  const warm = createReviewImagePreloader(() => {
    const image = {};
    images.push(image);
    return image;
  });
  warm(['/file/1']);
  images[0].onerror();
  warm(['/file/1']);
  images[0].onerror();
  warm(['/file/1']);
  assert.equal(images.length, 2);
  assert.doesNotThrow(() => images[1].onload());
});
