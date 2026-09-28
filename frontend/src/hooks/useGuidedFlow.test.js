import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveSteps } from './useGuidedFlow.js';

const image = { id: 1, filename: 'example.jpg', status: 'keep', caption: 'A red coat.' };
const caps = { training_visible: false, studio_visible: false, face_scoring: true };

test('an imported, captioned character is ready to export without a reference', () => {
  const flow = deriveSteps({ kind: 'character', images: [image] }, caps);
  assert.equal(flow.nextStep.id, 'finish');
  assert.equal(flow.steps.find((step) => step.id === 'reference').optional, true);
});

test('all dataset kinds can start by adding images', () => {
  for (const kind of ['character', 'concept', 'style']) {
    const flow = deriveSteps({ kind, images: [] }, caps);
    assert.equal(flow.nextStep.id, 'generate');
    assert.equal(flow.nextStep.label, 'Add Images');
    if (kind !== 'character') {
      assert.ok(flow.steps.every((step) => !['reference', 'score'].includes(step.id)));
    }
  }
});

test('pending generation does not claim an image has arrived', () => {
  const flow = deriveSteps({ ref_filename: 'ref.jpg', images: [{ status: 'pending' }] }, caps);
  assert.equal(flow.nextStep.id, 'generate');
  assert.equal(flow.nextStep.busy, true);
  assert.equal(flow.nextStep.done, false);
});

test('Bank and phone imports follow curation, captioning, then training', () => {
  const options = { ...caps, training_visible: true };
  assert.equal(deriveSteps({ kind: 'style', images: [{ ...image, status: 'pending' }] }, options).nextStep.id, 'curate');
  assert.equal(deriveSteps({ kind: 'concept', images: [{ ...image, caption: '' }] }, options).nextStep.id, 'caption');
  assert.equal(deriveSteps({ kind: 'concept', images: [image] }, options).nextStep.label, 'Train');
});

test('rejected images alone do not make a dataset ready for captions', () => {
  assert.equal(deriveSteps({ images: [{ ...image, status: 'reject' }] }, caps).nextStep.id, 'curate');
});
