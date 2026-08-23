import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { cloudTrainingLaunchPayload } from './checkpointBrowser.js';
import {
  TRAINING_MODE_FULL_TRANSFORMER,
  TRAINING_MODE_LORA,
  canRecheckFullTransformerDelivery,
  cloudTierEstimateView,
  fullTransformerArtifactView,
  fullTransformerRecheckOutcome,
  fullTransformerUnavailableReason,
  hfCloudTokenReadiness,
  isFullTransformerRun,
  isFullTransformerEligible,
  normalizeTrainingMode,
  trainingModeSettingsPayload,
  trainingModeLabel,
} from './trainingMode.js';
import { preflightUrl } from '../components/dataset/preflightLane.js';

// DIVERGENCE 4 — upstream reads all three files here (slice 1 split the dense
// recipe/picker and the cloud dialog out of the panel). Neither module exists on
// this fork, and the code they hold upstream is still inside the panel here, so
// one read covers the same text. Note the assertion below that the panel does
// NOT mention CloudLaunchDialog: on upstream that proves the split happened; here
// it proves the rental dialog never came back, which is the stronger claim.
const panel = readFileSync(new URL('../components/dataset/TrainingPanel.jsx', import.meta.url), 'utf8');
const datasetHook = readFileSync(new URL('../hooks/useDataset.js', import.meta.url), 'utf8');

test('training mode enum is exact and every legacy or invalid value falls back to LoRA', () => {
  assert.equal(TRAINING_MODE_LORA, 'lora');
  assert.equal(TRAINING_MODE_FULL_TRANSFORMER, 'full_transformer');
  assert.equal(normalizeTrainingMode('full_transformer'), 'full_transformer');
  assert.equal(normalizeTrainingMode('full_model'), 'lora');
  assert.equal(normalizeTrainingMode(undefined), 'lora');
  assert.equal(trainingModeLabel('lora'), 'LoRA');
  assert.equal(trainingModeLabel('full_transformer'), 'Full model');
});

test('dense eligibility is limited to the official Krea 2 Raw recipe', () => {
  assert.equal(isFullTransformerEligible({ trainType: 'krea', variant: 'base', baseModel: '' }), true);
  assert.equal(isFullTransformerEligible({ trainType: 'krea', variant: 'turbo', baseModel: '' }), false);
  assert.equal(isFullTransformerEligible({ trainType: 'zimage', variant: 'base', baseModel: '' }), false);
  assert.equal(isFullTransformerEligible({ trainType: 'krea', variant: 'base', baseModel: 'custom.safetensors' }), false);
  assert.equal(isFullTransformerEligible({
    trainType: 'krea', variant: 'base', baseModel: '', customBase: true,
  }), false);
  assert.match(fullTransformerUnavailableReason({ trainType: 'krea', variant: 'turbo' }), /Raw/);
});

test('cloud launch and preflight carry the mode while LoRA stays the default regression path', () => {
  assert.equal(cloudTrainingLaunchPayload({ trainType: 'krea', variant: 'base' }).training_mode, 'lora');
  assert.equal(cloudTrainingLaunchPayload({
    trainType: 'krea', variant: 'base', trainingMode: 'full_transformer', gpuName: 'H100',
  }).training_mode, 'full_transformer');
  assert.equal(preflightUrl(9, {
    trainType: 'krea', variant: 'base', baseModel: '',
    trainingMode: 'full_transformer', lane: 'cloud',
  }), '/api/dataset/9/train/preflight?train_type=krea&variant=base&base_model=&training_mode=full_transformer&lane=cloud');
  assert.deepEqual(trainingModeSettingsPayload('full_transformer', {
    trainType: 'krea', variant: 'base', baseModel: '',
    disableSliderForFullTransformer: true,
  }), {
    training_mode: 'full_transformer', train_type: 'krea', variant: 'base', base_model: '',
    disable_slider_for_full_transformer: true,
  });
});

test('the pending panel does not claim a model upload that has not started', () => {
  // Run #138: 'artifact_status' is stamped 'pending' at LAUNCH, so for the two
  // hours the run spent pushing its DATASET to the pod this panel announced
  // 'Uploading full model…' — a transfer that had not begun and could not,
  // next to a repository holding nothing but licence files. The run's phase is
  // what tells the two apart.
  const base = {
    training_mode: 'full_transformer', artifact_status: 'pending',
    hf_url: 'https://huggingface.co/me/private',
  };
  for (const status of ['preparing', 'provisioning', 'uploading']) {
    const view = fullTransformerArtifactView({ ...base, status });
    assert.equal(view.label, 'Full model not created yet', `status=${status}`);
    assert.match(view.detail, /Nothing is uploading to Hugging Face yet/);
    assert.equal(view.href, null);
    assert.equal(view.available, false);
  }

  const training = fullTransformerArtifactView({ ...base, status: 'training' });
  assert.equal(training.label, 'Full model not delivered yet');
  assert.match(training.detail, /delivered to Hugging Face at the end of the run/);

  // Once training is over, 'pending' does mean the weights are on their way.
  const delivering = fullTransformerArtifactView({ ...base, status: 'downloading' });
  assert.equal(delivering.label, 'Uploading full model…');

  // The worst version of the same lie, caught on the proof screenshot: a run
  // the supervisor had already terminated still announced an upload in flight
  // AND told the user to keep a pod alive that no longer existed.
  for (const status of ['error', 'stopped', 'error_pod_kept', 'done']) {
    const over = fullTransformerArtifactView({ ...base, status });
    assert.equal(over.label, 'Full model was never delivered', `status=${status}`);
    assert.match(over.detail, /ended before any weights reached Hugging Face/);
    assert.doesNotMatch(over.detail, /[Kk]eep the run and pod active/);
    assert.equal(over.tone, 'warning');
  }

  // No status at all (an older payload) is not evidence of anything: it keeps
  // the neutral wording rather than announcing a failed delivery.
  const unknown = fullTransformerArtifactView(base);
  assert.equal(unknown.label, 'Uploading full model…');
  assert.equal(unknown.tone, 'info');

  // Repository creation keeps its own label whatever the phase says, and a
  // detail the backend did send always wins over any of these fallbacks.
  assert.equal(fullTransformerArtifactView({
    ...base, artifact_status: 'creating_repository', status: 'preparing',
  }).label, 'Creating Hugging Face repository…');
  assert.equal(fullTransformerArtifactView({
    ...base, status: 'uploading', artifact_status_detail: 'from the backend',
  }).detail, 'from the backend');
});

test('a full artifact link exists only after verified availability', () => {
  const pending = fullTransformerArtifactView({
    training_mode: 'full_transformer', artifact_status: 'verification_pending',
    hf_url: 'https://huggingface.co/me/private', artifact_status_detail: 'token timed out',
  });
  assert.equal(pending.href, null);
  assert.equal(pending.repositoryHref, 'https://huggingface.co/me/private');
  assert.equal(pending.tone, 'warning');
  assert.equal(pending.label, 'Hugging Face verification pending');
  assert.match(pending.detail, /token timed out/);

  const missing = fullTransformerArtifactView({
    artifact_status: 'missing', hf_url: 'https://huggingface.co/me/private',
  });
  assert.equal(missing.href, null);
  assert.equal(missing.tone, 'error');
  assert.equal(missing.label, 'Full model not found');

  const available = fullTransformerArtifactView({
    artifact_status: 'available', hf_url: 'https://huggingface.co/me/private',
  });
  assert.equal(available.href, 'https://huggingface.co/me/private');
  assert.equal(available.available, true);
  assert.equal(available.label, 'Full model available');
  assert.equal(isFullTransformerRun({ training_mode: 'full_transformer' }), true);
});

test('dense token readiness fails closed only when the backend explicitly reports a problem', () => {
  assert.deepEqual(hfCloudTokenReadiness({}), {
    signaled: false, ready: true, blocked: false, detail: null,
  });
  const offerFailure = hfCloudTokenReadiness({
    hf_cloud_token: {
      ok: false, configured: true,
      error: 'HF_CLOUD_TOKEN cannot write to the dedicated namespace',
    },
  });
  assert.equal(offerFailure.blocked, true);
  assert.match(offerFailure.detail, /dedicated namespace/);
  assert.equal(hfCloudTokenReadiness({
    hf_cloud_token: { ok: true, configured: true, namespace: 'lds-deliveries' },
  }).ready, true);
  assert.equal(hfCloudTokenReadiness({
    checks: [{ id: 'hf_cloud_token', status: 'fail', detail: 'fine-grained scope invalid' }],
    hf_cloud_token_status: { ok: false, configured: true },
  }).blocked, true);
});

test('kept dense runs can recheck verification or pending pod cleanup', () => {
  assert.equal(canRecheckFullTransformerDelivery({
    training_mode: 'full_transformer', status: 'error_pod_kept',
    artifact_status: 'verification_pending',
  }), true);
  assert.equal(canRecheckFullTransformerDelivery({
    training_mode: 'full_transformer', status: 'error_pod_kept',
    artifact_status: 'available',
  }), true);
  assert.equal(canRecheckFullTransformerDelivery({
    training_mode: 'full_transformer', status: 'error_pod_kept',
    artifact_status: 'available', artifact_cleanup_status: 'pending',
  }), true);
  assert.equal(canRecheckFullTransformerDelivery({
    training_mode: 'full_transformer', status: 'error_pod_kept',
    artifact_status: 'available', artifact_cleanup_status: 'complete',
  }), false);
  assert.equal(canRecheckFullTransformerDelivery({
    training_mode: 'lora', status: 'error_pod_kept', artifact_status: 'verification_pending',
  }), false);
});

test('legacy verified kept rows default to visible cleanup-pending state', () => {
  const legacy = fullTransformerArtifactView({
    training_mode: 'full_transformer', status: 'error_pod_kept',
    artifact_status: 'available',
    hf_url: 'https://huggingface.co/me/private',
  });
  assert.equal(legacy.available, true);
  assert.equal(legacy.cleanupPending, true);
  assert.equal(legacy.href, 'https://huggingface.co/me/private');
  assert.equal(legacy.tone, 'warning');
  assert.match(legacy.detail, /may still be billing/);
});

test('verified model and pending cleanup never produce a pod-released success', () => {
  const pending = fullTransformerRecheckOutcome({
    ok: true, delivery: 'available', cleanup_pending: true,
  });
  assert.equal(pending.kind, 'warning');
  assert.match(pending.text, /Hugging Face model verified and available/);
  assert.match(pending.text, /may still be billing/);

  const complete = fullTransformerRecheckOutcome({
    ok: true, delivery: 'available', cleanup_pending: false,
  });
  assert.equal(complete.kind, 'success');
  assert.match(complete.text, /pod cleanup is confirmed/);
});

test('dense offers never reuse an unlabelled or unavailable estimate', () => {
  assert.deepEqual(cloudTierEstimateView({
    est_minutes: 42, est_cost: 1.25, exceeds_cap: true,
  }, { fullMode: true }), {
    available: false, minutes: null, cost: null, exceedsCap: false, status: null,
  });
  assert.equal(cloudTierEstimateView({
    estimate_status: 'unavailable', est_minutes: 42, est_cost: 1.25, exceeds_cap: true,
  }, { fullMode: true }).available, false);
  assert.equal(cloudTierEstimateView({
    estimate_status: 'available', est_minutes: null, est_cost: null, exceeds_cap: true,
  }, { fullMode: true }).available, false);
  assert.deepEqual(cloudTierEstimateView({
    estimate_status: 'available', est_minutes: 42, est_cost: 1.25, exceeds_cap: true,
  }, { fullMode: true }), {
    available: true, minutes: 42, cost: 1.25, exceedsCap: true, status: 'available',
  });
  // Legacy LoRA offers remain usable while the backend rolls out estimate_status.
  assert.equal(cloudTierEstimateView({ est_minutes: 42 }, { fullMode: false }).available, true);
});

test('dense Advanced renders only the locked server recipe and its honored steps input', () => {
  const recipe = panel.slice(
    panel.indexOf('// FULL_TRANSFORMER_ADVANCED_RECIPE_START'),
    panel.indexOf('// FULL_TRANSFORMER_ADVANCED_RECIPE_END'),
  );
  assert.match(panel, /Locked full-model recipe · steps/);
  assert.match(recipe, /Official Krea 2 Raw · full transformer · unquantized/);
  assert.match(recipe, /1024 px · batch 1 · bf16/);
  assert.match(recipe, /Adafactor · learning rate 1e-6/);
  assert.match(recipe, /Gradient checkpointing · cached latents \+ text embeddings/);
  assert.match(recipe, /Checkpoint \+ preview every 250 steps · keep 1 checkpoint/);
  assert.match(recipe, /80 GB VRAM GPU · at least 200 GB disk/);
  assert.match(recipe, /The only editable setting in this full-model recipe/);
  assert.equal([...recipe.matchAll(/<input\b/g)].length, 1);
  assert.match(recipe, /setStepsOverride\(event\.target\.value\)/);
  assert.doesNotMatch(recipe, /<select\b|<button\b|saveAdv\(|setBase\(|setVariant\(|setMasked\(/,
    'the dense recipe card must not grow an ignored LoRA control');
});

test('the full Advanced branch cannot render the unchanged LoRA controls', () => {
  const branch = panel.slice(
    panel.indexOf('{fullMode ? (', panel.indexOf('FULL_TRANSFORMER_ADVANCED_BRANCH_START')),
    panel.indexOf('FULL_TRANSFORMER_ADVANCED_BRANCH_END'),
  );
  const split = branch.indexOf(') : (<>');
  assert.ok(split > 0, 'Advanced must have explicit dense and LoRA render arms');
  const denseArm = branch.slice(0, split);
  const loraArm = branch.slice(split);
  assert.match(denseArm, /<FullTransformerAdvancedRecipe/);
  assert.doesNotMatch(denseArm, /Presets|CUSTOM_BASE_SENTINEL|advNetworkType|Masked \(bg 10%\)|saveAdv\(/);
  assert.match(loraArm, /Presets/);
  assert.match(loraArm, /CUSTOM_BASE_SENTINEL/);
  assert.match(loraArm, /advNetworkType/);
  assert.match(loraArm, /Masked \(bg 10%\)/);
  assert.match(loraArm, /saveAdv\(/);
  assert.match(panel, /advancedOpen && trainingMode !== TRAINING_MODE_FULL_TRANSFORMER/);
});

test('local hook persists and launches with the canonical mode', () => {
  assert.match(datasetHook, /trainingModeSettingsPayload\(trainingMode, selection\)/);
  assert.match(datasetHook, /slider: d\.slider \?\? null/);
  assert.match(datasetHook, /training_mode: normalizeTrainingMode\(opts\.trainingMode\)/);
  assert.match(datasetHook, /catch \(error\)[\s\S]*return null/);
});

test('the training panel offers no rented GPU, and no token to rent one with', () => {
  // Divergence 4: upstream's 2026-08-01 window added three tests pinning the
  // rental dialog's offer fetch, its HF_CLOUD_TOKEN banner and its price-cap
  // link. This fork has no rented lane, so they are INVERTED rather than
  // deleted — a sync that re-lands the dialog fails here instead of shipping a
  // panel that quotes an hourly price the app cannot charge.
  assert.doesNotMatch(panel, /CloudLaunchDialog|CustomBasePushSection/);
  assert.doesNotMatch(panel, /HF_CLOUD_TOKEN|hfCloudTokenReadiness|before renting the GPU/);
  assert.doesNotMatch(panel, /train\/cloud\/offers|cloud-max-price-per-hour/);
});

test('mode persistence is atomic and the incompatible fallback is not optimistic', () => {
  assert.match(panel, /setDatasetTrainingMode\?\.\(TRAINING_MODE_LORA, nextSelection\)/);
  assert.match(panel, /setDatasetTrainingMode\?\.\(\s*TRAINING_MODE_LORA,\s*fullTransformerSelection/);
  const fallback = panel.slice(panel.indexOf('// Family, Krea variant'), panel.indexOf('const toggleSliderMode'));
  const persistAt = fallback.indexOf('await ds.setDatasetTrainingMode');
  const showLoraAt = fallback.indexOf('setTrainingMode(TRAINING_MODE_LORA)');
  assert.ok(persistAt >= 0 && showLoraAt > persistAt,
    'the UI must not claim LoRA before the save resolves');
  assert.match(fallback, /const info = await ds\.trainBaseInfo/);
  const modeChange = panel.slice(panel.indexOf('const onTrainingModeChange'), panel.indexOf('const onTrainingModeKeyDown'));
  assert.match(modeChange, /disableSliderForFullTransformer: nextMode === TRAINING_MODE_FULL_TRANSFORMER/);
  assert.match(modeChange, /saved\.slider\?\.enabled !== false/);
  assert.doesNotMatch(modeChange, /saveSlider\(/,
    'switching to full must not issue or roll back a separate Slider request');
  assert.ok(modeChange.indexOf('setTrainingMode(canonicalMode)') > modeChange.indexOf('saved.slider?.enabled !== false'),
    'the UI must wait for the canonical mode + disabled Slider response');
});

