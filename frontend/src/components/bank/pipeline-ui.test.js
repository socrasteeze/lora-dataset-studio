// Reads the image Bank TREE, not one file: the Encre redesign split the
// workspace into a top bar, a filter rail, a passes panel and the grid, and a
// wiring assertion must survive a move (see bankTreeSource.js).
import { bankTreeSource } from './bankTreeSource.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pipelineStepKeys } from './bankSemanticEngine.js';

import { FALLBACK_ORDER, buildSteps, defaultChecked } from './pipelineSteps.js';

const facets = fs.readFileSync(new URL('./bankFacets.js', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('./LaunchAllDialog.jsx', import.meta.url), 'utf8');
const ws = bankTreeSource();

test('the launch dialog posts the three config keys the backend expects', () => {
  assert.match(dialog, /steps:\s*\[\.\.\.steps\]/);
  assert.match(dialog, /reject_flags:\s*autoRejectOn\s*\?\s*\[\.\.\.rejectFlags\]\s*:\s*\[\]/);
  assert.match(dialog, /resolve_dups:\s*autoRejectOn\s*&&\s*resolveDups/);
});

test('the overnight dialog offers no non-verdict flag; the attended button prints its caveat', () => {
  // The unattended funnel must never offer to bulk-reject on a provenance HINT.
  const list = dialog.match(/const QUALITY_FLAGS = \[([^\]]*)\]/);
  assert.ok(list, 'found the dialog flag list');
  assert.doesNotMatch(list[1], /soft_detail/);
  assert.doesNotMatch(list[1], /bars/);
  // The standalone 🧹 Auto-reject still offers them — with the caveat SHOWN,
  // not left in a title= tooltip nobody sees on a phone.
  assert.match(facets, /QUALITY_REJECT_FLAGS = \['blur', 'noise', 'uniform', 'small', 'soft_detail', 'bars'\]/);
  assert.match(ws, /\{FLAG_HINT\[f\] && \(/);
  assert.match(facets, /check before mass-rejecting/);
});

test('captioning is OFF by default; auto-reject defaults to duplicates only', () => {
  // The default-checked RULE moved into pipelineSteps.defaultChecked when the
  // step list moved onto the server, so it is asserted through the module now
  // rather than by grepping this file for a literal Set — the same migration
  // passDeviceGate.test.js made, and for the same reason: a reformat or an
  // inline comment used to break these greps with no behaviour change.
  const steps = buildSteps(FALLBACK_ORDER);
  const allReady = Object.fromEntries(steps.map((s) => [s.key, true]));
  const checked = defaultChecked(steps, allReady);
  assert.equal(checked.has('caption'), false);
  assert.equal(checked.has('scan'), true);
  assert.equal(checked.has('auto_reject'), true);
  // Quality flags start empty so an overnight run does not bin blurry/flat
  // unless the user ticks them; ≈ Duplicates (resolveDups) stays on.
  assert.match(dialog, /const \[rejectFlags, setRejectFlags\] = useState\(\(\) => new Set\(\)\)/);
  assert.match(dialog, /const \[resolveDups, setResolveDups\] = useState\(true\)/);
});

test('a heavy pass whose tool is not ready is auto-unchecked and flagged "will skip"', () => {
  // The per-pass rules moved into passDeviceGate.js when the verdict stopped
  // being about THIS machine only — it now answers for whichever machine the
  // picker selected. The rule itself is unchanged for a local run.
  const gate = fs.readFileSync(new URL('./passDeviceGate.js', import.meta.url), 'utf8');
  assert.match(gate, /return !!caps\?\.bank_scoring/);
  assert.match(gate, /return !!caps\?\.face_scoring/);
  assert.match(gate, /return !!visionReady/);
  // The default set intersects readiness — asserted on the function that does
  // it, not on the call site's shape.
  const steps = buildSteps(['scan', 'score']);
  assert.deepEqual([...defaultChecked(steps, { scan: true, score: false })], ['scan']);
  assert.match(dialog, /will skip/);
});

test('Launch all only offers the SigLIP2 index step on a Bank actually using it', () => {
  // No semanticEngine prop to carry: caps.bank_pipeline_steps is published by
  // the SERVER already scoped to the bank's own selected engine (see
  // capabilities.py / _SIGLIP2_PIPELINE_STEPS), so the dialog needs nothing
  // beyond buildSteps(caps?.bank_pipeline_steps) to get the right step list.
  assert.match(dialog, /buildSteps\(caps\?\.bank_pipeline_steps\)/);
  const siglip = pipelineStepKeys('siglip2');
  const clip = pipelineStepKeys('clip');
  assert.ok(siglip.includes('semantic_index'));
  assert.equal(clip.includes('semantic_index'), false);
});

test('the progress bar understands the pipeline kind (step X/N + per-step chips)', () => {
  assert.match(ws, /kind === 'pipeline' \? activity\.pipeline/);
  assert.match(ws, /step \$\{\(pipe\.index \?\? 0\) \+ 1\}\/\$\{pipe\.total_steps\}/);
  assert.match(ws, /pipe\.results\.map/);
});

test('the report renders per-step status and is fed from the persisted payload field', () => {
  // The four statuses and their styling moved to pipelineReportView.js, which
  // also decides when a step has been re-run since — pinned there by
  // pipelineReportView.test.js. This entry follows the property, not the file it
  // used to live in.
  const view = fs.readFileSync(new URL('./pipelineReportView.js', import.meta.url), 'utf8');
  assert.match(view, /STATUS_STYLE/);
  assert.match(view, /skipped/);
  assert.match(view, /cancelled/);
  assert.match(view, /error/);
  // The workspace shows it only when idle, from the persisted field.
  assert.match(ws, /payload\.pipeline_report/);
  assert.match(ws, /<PipelineReport/);
});

test('launching posts to the pipeline endpoint', () => {
  assert.match(ws, /\/api\/bank\/\$\{bankId\}\/pipeline/);
});
