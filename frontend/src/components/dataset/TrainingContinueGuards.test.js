import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const panel = fs.readFileSync(new URL('./TrainingPanel.jsx', import.meta.url), 'utf8');

test('continuation uses the preflight lane and the shared confirmation request', () => {
  assert.match(panel, /import \{ laneOfPayload, preflightUrl \} from '\.\/preflightLane\.js'/);
  assert.match(panel, /const lane = laneOfPayload\(payload\);/);
  assert.match(panel, /runConfirmableTrainingRequest/);
  assert.match(panel, /preflightOk\(\{ lane,/);
});

test('a missing rental plugin keeps the cloud continuation lane closed', () => {
  assert.match(panel, /contributions\('training\.continue\.lane', 'dataset'\)/);
  assert.match(panel, /cloudEnabled = pluginLanes\.some\(\(lane\) => lane\.id === 'cloud'\)/);
  assert.match(panel, /rented-GPU training was removed/);
});
