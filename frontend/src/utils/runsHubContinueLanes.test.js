import assert from 'node:assert/strict';
import test from 'node:test';

import { runsHubContinueLanes } from './runsHubContinueLanes.js';

const RUN = { run_id: 7, dataset_id: 3, train_type: 'zimage', variant: 'turbo' };

test('a completed run can continue locally when ai-toolkit is ready', () => {
  const lanes = runsHubContinueLanes(RUN, { aitoolkitValid: true });
  assert.deepEqual(lanes.local, { available: true });
});

test('the local lane states its real blocker instead of disappearing', () => {
  const unavailable = runsHubContinueLanes(RUN, { aitoolkitValid: false });
  assert.equal(unavailable.local.available, false);
  assert.match(unavailable.local.reason, /ai-toolkit/);

  const busy = runsHubContinueLanes(RUN, { aitoolkitValid: true, localActive: { dataset_id: 99 } });
  assert.equal(busy.local.available, false);
  assert.match(busy.local.reason, /already running on this machine/);
});

test('a missing dataset id never posts a continuation that cannot resolve locally', () => {
  const lanes = runsHubContinueLanes({ run_id: 9 }, { aitoolkitValid: true });
  assert.equal(lanes.local.available, false);
  assert.match(lanes.local.reason, /dataset is unknown/);
  assert.equal(runsHubContinueLanes(null, {}), null);
});

test('the retired rental lane remains visibly closed', () => {
  const lanes = runsHubContinueLanes(RUN, { aitoolkitValid: true });
  assert.equal(lanes.cloud.available, false);
  assert.match(lanes.cloud.reason, /own machine only/);
});
