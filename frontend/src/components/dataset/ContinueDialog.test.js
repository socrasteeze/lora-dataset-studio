import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dialog = fs.readFileSync(new URL('./ContinueDialog.jsx', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('./TrainingPanel.jsx', import.meta.url), 'utf8');
const runsHub = fs.readFileSync(new URL('../runs/RunsHub.jsx', import.meta.url), 'utf8');
const hook = fs.readFileSync(new URL('../../hooks/useDataset.js', import.meta.url), 'utf8');

test('the dialog resolves an explicit local continuation payload', () => {
  assert.match(dialog, /fromStep:\s*isEarlier\s*\?\s*fromStep\s*:\s*null/);
  assert.match(dialog, /extraSteps:\s*extraNum/);
  assert.match(dialog, /overrides:\s*Object\.keys\(overrides\)\.length/);
  assert.match(dialog, /resumeMode,/);
  assert.match(dialog, /stateBundleId:\s*resumeMode === 'full_state'/);
  assert.match(dialog, /topic="continue-training"/);
});

test('the dataset panel and local Runs hub share one continuation dialog', () => {
  assert.match(panel, /import ContinueDialog from '\.\/ContinueDialog'/);
  assert.match(panel, /<ContinueDialog/);
  assert.match(runsHub, /import ContinueDialog from '\.\.\/dataset\/ContinueDialog\.jsx'/);
  assert.match(runsHub, /<ContinueDialog/);
});

test('the dataset panel uses the guarded local continuation request', () => {
  assert.match(panel, /runConfirmableTrainingRequest/);
  assert.match(panel, /const lane = laneOfPayload\(payload\);/);
  assert.match(panel, /if \(pluginLane\) \{/);
  assert.match(panel, /ds\.continueTraining\(\s*payload\.extraSteps, continueBase, continueVariant, continueType, opts\)/);
  assert.match(panel, /fromStep:\s*payload\.fromStep,\s*overrides:\s*payload\.overrides/);
});

test('the dataset hook forwards local continuation options only when supplied', () => {
  assert.match(hook, /opts\.fromStep\s*!=\s*null\s*\?\s*\{\s*from_step:\s*opts\.fromStep\s*\}/);
  assert.match(hook, /opts\.overrides\s*\?\s*\{\s*overrides:\s*opts\.overrides\s*\}/);
  assert.match(hook, /resume_mode:\s*opts\.resumeMode \|\| 'weights_only'/);
  assert.match(hook, /opts\.stateBundleId\s*\?\s*\{\s*state_bundle_id:\s*opts\.stateBundleId\s*\}/);
  assert.doesNotMatch(hook, /train\/cloud\/continue-local/);
});

test('full state is selectable only for a verified exact local bundle', () => {
  assert.match(dialog, /defaultResumeMode\(selectedCheckpoint, lane\)/);
  assert.match(dialog, /aria-label="Training state to restore"/);
  assert.match(dialog, /value="full_state"/);
  assert.match(dialog, /disabled=\{!fullStateAvailable\}/);
  assert.match(dialog, /value="weights_only"/);
});

test('the dialog exposes learning-rate and cadence choices without changing a full-state trajectory', () => {
  assert.match(dialog, /LR_FACTOR_CHOICES/);
  assert.match(dialog, /overrides\.lr_factor\s*=\s*lrFactor/);
  assert.match(dialog, /trajectoryLocked\s*=\s*resumeMode === 'full_state'/);
  assert.match(dialog, /disabled=\{trajectoryLocked\}\s*aria-label="Checkpoint frequency"/);
  assert.match(dialog, /disabled=\{trajectoryLocked\}\s*aria-label="Preview sample frequency"/);
});
