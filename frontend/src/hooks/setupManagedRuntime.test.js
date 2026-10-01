import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { comfyuiLauncherState, deriveSetupSteps } from './useSetupSteps.js';

function setupStep(id, caps, runtimeReadiness) {
  return deriveSetupSteps(caps, runtimeReadiness).find((item) => item.id === id);
}

test('a stale integrated readiness does not hide the portable launcher', () => {
  const step = setupStep('comfyui', {
    engines: {},
    comfyui: {
      reachable: false,
      skipped: true,
      dir_valid: true,
      portable_launcher_supported: true,
      portable_launcher_local_api: true,
    },
  }, {
    comfyui: { mode: 'integrated', state: 'starting', ready: false, poll: true },
  });

  assert.equal(step.managedMode, 'external');
  assert.equal(step.managedInitializing, false);
  assert.equal(step.skipped, true);
  assert.deepEqual(comfyuiLauncherState({ ...step, skipped: false }, true), {
    visible: true, enabled: true, reason: '',
  });
});

test('a reported external-host mode no longer hides the portable Start button', () => {
  const step = setupStep('comfyui', {
    engines: {},
    comfyui: {
      reachable: false,
      dir_valid: true,
      portable_launcher_supported: true,
      portable_launcher_local_api: true,
    },
  }, {
    comfyui: { mode: 'external-host', state: 'manual', ready: false, poll: false },
  });

  assert.equal(step.status, 'available');
  assert.deepEqual(comfyuiLauncherState(step, true), {
    visible: true, enabled: true, reason: '',
  });
});

test('external ComfyUI remains manual and can expose its safe portable launcher', () => {
  const step = setupStep('comfyui', {
    engines: {},
    comfyui: {
      reachable: false,
      dir_valid: true,
      portable_launcher_supported: true,
      portable_launcher_local_api: true,
    },
  }, {
    comfyui: { mode: 'external', state: 'manual', ready: false, poll: false },
  });

  assert.equal(step.status, 'available');
  assert.equal(step.managedInitializing, false);
  assert.deepEqual(comfyuiLauncherState(step, true), {
    visible: true, enabled: true, reason: '',
  });
});

test('Ollama readiness no longer switches the step off the direct install', () => {
  const caps = { ollama: { reachable: false, installed: false } };
  const step = setupStep('ollama', caps, {
    ollama: { mode: 'host', state: 'unreachable', ready: false, poll: false },
  });
  assert.equal(step.deploymentMode, 'local');
  assert.equal(step.disabled, false);
  assert.equal(step.managedInitializing, false);
  assert.equal(step.status, 'available');
});

test('Setup polls the lightweight endpoint without overlap and cleans up timers', () => {
  const source = fs.readFileSync(new URL('../pages/SetupPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /apiFetch\('\/api\/setup\/runtime-readiness'/);
  assert.match(source, /background: true/);
  assert.match(source, /cache: 'no-store'/);
  assert.match(source, /setTimeout\(check, delay\)/);
  assert.match(source, /schedule\(3000\)/);
  assert.match(source, /clearTimeout\(timer\)/);
  assert.match(source, /controller\?\.abort\(\)/);
  assert.match(source, /capabilityRefreshPending = true/);
  assert.match(source, /refresh\(true, \{ background: true \}\)/);
  assert.match(source, /capabilityRefreshPending = !refreshed/);
  assert.match(source, /next\.ollama\?\.poll \|\| capabilityRefreshPending/);
});

test('capability refresh reports silent failure instead of stopping managed polling', () => {
  const source = fs.readFileSync(
    new URL('../context/CapabilitiesContext.jsx', import.meta.url), 'utf8',
  );

  assert.match(source, /refresh = useCallback\(async \(force = false, options = \{\}\)/);
  assert.match(source, /apiFetch\([\s\S]*options,[\s\S]*\)/);
  // Divergence 4: the fork always overrides cloud_training to false before the
  // caller ever sees it (the managed-runtime probe reads the return value
  // directly), so it is `setCaps(local); return local` here, not upstream's
  // bare `setCaps(data); return data`.
  assert.match(source, /const local = \{ \.\.\.data, cloud_training: false \}/);
  assert.match(source, /setCaps\(local\)\s*return local/);
  assert.match(source, /catch \{[\s\S]*return null/);
});

test('Setup explains every managed runtime state in the UI', () => {
  const source = fs.readFileSync(new URL('../pages/SetupPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /No model is downloaded automatically/);
  assert.match(source, /git clone https:\/\/github.com\/comfyanonymous\/ComfyUI/);
  assert.doesNotMatch(source, /LDS_OLLAMA_MODE/);
  assert.doesNotMatch(source, /ollama-sidecar/);
});
