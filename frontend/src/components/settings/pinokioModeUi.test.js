/* Offline update controls and the retained external launcher instructions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const maintenance = read('./MaintenanceSection.jsx');
const app = read('../../App.jsx');
const instructions = read('../common/PinokioUpdateInstructions.jsx');
const startScript = read('../../../../start.js');

test('the offline app offers manual updates without hosted update controls', () => {
  assert.match(maintenance, /outside LDS, then restart/);
  for (const source of [maintenance, app]) {
    assert.doesNotMatch(source, /\/api\/update\/(check|apply)/);
    assert.doesNotMatch(source, /lds:update-available/);
    assert.doesNotMatch(source, /<PinokioUpdateInstructions/);
  }
});

test('the shared presentation renders the steps and never an apply action', () => {
  assert.match(instructions, /PINOKIO_UPDATE_STEPS\.map\(/);
  assert.match(instructions, /href=\{PINOKIO_UPDATE_GUIDE_URL\}/);
  assert.doesNotMatch(instructions, /Update &(?:amp;)? restart/);
});

test('the launcher is what puts the app in this mode', () => {
  // Without LDS_RUNTIME the backend cannot know it was launched by Pinokio, and
  // the card would offer the button again.
  assert.match(startScript, /LDS_RUNTIME:\s*"pinokio"/);
});
