// Reads the image Bank TREE, not one file: the Encre redesign split the
// workspace into a top bar, a filter rail, a passes panel and the grid, and a
// wiring assertion must survive a move (see bankTreeSource.js).
import { bankTreeSource } from './bankTreeSource.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BANK_PASSES } from './bankPasses.js';
import { pipelineStepKeys } from './bankSemanticEngine.js';

import { FALLBACK_ORDER, buildSteps, defaultChecked } from './pipelineSteps.js';

const ws = bankTreeSource();
const panel = fs.readFileSync(new URL('./DupGroupsPanel.jsx', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('./LaunchAllDialog.jsx', import.meta.url), 'utf8');
const pipelineStepsSrc = fs.readFileSync(new URL('./pipelineSteps.js', import.meta.url), 'utf8');
// The ≈/✂ marks moved out of the JSX into a pure helper so the "is this group
// still open?" rule could be unit-tested — see bankDupBadge.js.
const badge = fs.readFileSync(new URL('./bankDupBadge.js', import.meta.url), 'utf8');

test('the semantic near-duplicate badge is distinct from the exact-duplicate one', () => {
  // Exact dups use ≈ (fuchsia); semantic dups use ✂ (orange) — a different mark
  // AND a different colour so the two stages never read as the same thing.
  assert.match(badge, /mark: '≈'/);
  assert.match(badge, /text-fuchsia-200/);
  assert.match(badge, /mark: '✂'/);
  assert.match(badge, /text-orange-200/);
  // …and the two stages stay separate rows in the table, keyed to their own
  // column and their own live-state flag.
  assert.match(badge, /group: 'dup_group', flag: 'dup_unresolved'/);
  assert.match(badge, /group: 'semantic_dup_group', flag: 'semantic_dup_unresolved'/);
});

test('the workspace renders both stages through the shared panel with distinct kinds', () => {
  assert.match(ws, /filter\.flag === 'dups'/);
  assert.match(ws, /kind="exact"/);
  assert.match(ws, /filter\.flag === 'semantic_dups'/);
  assert.match(ws, /kind="semantic"/);
});

test('the ✂ Find crops button gates on selected semantic readiness', () => {
  // The button opens its launch window; the endpoint is named once, in the pass
  // spec, and the shared runner builds the URL from it.
  assert.match(ws, /onClick=\{\(\) => onPassOpen\('semantic_dedup'\)\}/);
  // The panel is handed the workspace's own opener — no second pass router.
  assert.match(ws, /onPassOpen=\{setPassOpen\}/);
  const passes = fs.readFileSync(new URL('./bankPasses.js', import.meta.url), 'utf8');
  assert.match(passes, /endpoint: 'semantic-dedup'/);
  assert.match(ws, /\/api\/bank\/\$\{bankId\}\/\$\{spec\.endpoint\}/);
  // Score is a separate aesthetic count; only the selected engine readiness gates it.
  assert.match(ws, /onPassOpen\('semantic_dedup'\)\} disabled=\{live \|\| !semanticReady\}/);
  const button = ws.slice(ws.indexOf("onPassOpen('semantic_dedup')"),
    ws.indexOf("onPassOpen('semantic_dedup')") + 900);
  assert.doesNotMatch(button, /scored\s*[=>]/);
  assert.match(button, /semanticState\.label/);
});

test('✂ Find crops quotes NO number, and says why instead of inventing one', () => {
  // Its pool is "every image the selected engine indexed" — that lives in an engine
  // cache, not in a column, so no honest count exists client-side. The rule on
  // this surface is that every number is one somebody measured, so this window shows
  // none and explains the absence.
  //
  // Asserted on the VALUES, not on the source text: the first version of this test
  // matched a regex across the `+` of a wrapped string literal, so re-flowing a
  // sentence by one word turned it red without a single user-visible word changing.
  // The claim here is about what the window SAYS, so read what it says.
  const spec = BANK_PASSES.semantic_dedup;
  assert.ok(spec, 'the ✂ spec is missing');
  assert.equal(spec.countable, false);
  assert.match(spec.fixedScopeLine, /rejected .*included/);
  assert.match(spec.fixedScopeLine, /selected semantic engine/);
  assert.match(spec.fixedScopeLine, /without inventing one/);
});

test('the resolution panel hits the semantic endpoints and uses same-shot wording', () => {
  assert.match(panel, /semantic-dup-groups/);
  assert.match(panel, /semantic-dups\/resolve/);
  assert.match(panel, /same shot/i);
  // Both stages share the keep-best / keep-first / pick-one resolution.
  assert.match(panel, /Resolve ALL — keep best/);
  assert.match(panel, /keep_ids:\s*\[img\.id\]/);
});

test('Launch all inserts the semantic step right after Score, defaulting on when ready', () => {
  // The step list moved out of the dialog and onto the server
  // (pipelineSteps.js), so this is asserted through the module rather than by
  // grepping the JSX for a `key: 'semantic_dedup'` literal.
  const keys = buildSteps(FALLBACK_ORDER).map((s) => s.key);
  assert.ok(keys.includes('semantic_dedup'));
  assert.equal(keys.indexOf('semantic_dedup'), keys.indexOf('score') + 1,
    'semantic_dedup reuses Score’s embeddings, so it belongs immediately after it');
  // Its readiness rule lives in passDeviceGate.js: it follows Score's verdict
  // on whichever machine will run Score, and is never blocked by the device
  // because it always runs here.
  const gate = fs.readFileSync(new URL('./passDeviceGate.js', import.meta.url), 'utf8');
  assert.match(gate, /if \(key === 'semantic_dedup'\)[\s\S]{0,200}stepGate\('score', ctx\)/);
  const steps = buildSteps(FALLBACK_ORDER);
  const ready = Object.fromEntries(steps.map((s) => [s.key, true]));
  assert.equal(defaultChecked(steps, ready).has('semantic_dedup'), true,
    'it defaults on when Score can run');
});

test('duplicate resolution waits for every refresh before releasing its busy state', () => {
  // node --test cannot parse JSX, so pin the observable sequencing contract in
  // source: refresh the panel, await the parent overview/grid refresh, then let
  // the finally block enable the controls again.
  const panelRefresh = panel.indexOf('await refresh(0)');
  const parentRefresh = panel.indexOf('await onChanged?.()', panelRefresh);
  const releaseBusy = panel.indexOf('setBusy(false)', parentRefresh);
  assert.ok(panelRefresh >= 0, 'the panel refresh is awaited');
  assert.ok(parentRefresh > panelRefresh, 'the async parent refresh is awaited after it');
  assert.ok(releaseBusy > parentRefresh, 'busy is released only after both refreshes finish');

  for (const kind of ['exact', 'semantic']) {
    const callsiteStart = ws.indexOf(`kind="${kind}"`);
    assert.ok(callsiteStart >= 0, `the ${kind} duplicate panel is rendered`);
    // To the END OF THIS ELEMENT, not a fixed number of characters. The window
    // used to be 200 and it broke the day the callsite legitimately gained a
    // prop: the assertion was still true, the slice just no longer reached it.
    // A window that has to be re-tuned every time the thing it measures grows
    // is a false red waiting to happen — and, widened by hand, a window that
    // could start matching the NEXT callsite and pass for the wrong reason.
    const end = ws.indexOf('/>', callsiteStart);
    assert.ok(end > callsiteStart, `the ${kind} callsite is a self-closing element`);
    const callsite = ws.slice(callsiteStart, end);
    assert.match(callsite,
      /onChanged=\{async \(\) => \{ await refreshPayload\(\); await refreshImages\(\) \}\}/,
      `the ${kind} callback returns and awaits both parent refreshes`);
  }
});

test('Launch all keeps CLIP unchanged and inserts SigLIP2 index right before dedup', () => {
  // The dialog itself carries no per-engine step list any more (see the NOTE
  // at the top of this file explaining why) — it renders buildSteps() over
  // whatever order the SERVER publishes, so the assertion belongs on the
  // server-order function and the copy table, not on dialog literals.
  assert.match(dialog, /buildSteps\(caps\?\.bank_pipeline_steps\)/);
  assert.match(pipelineStepsSrc, /semantic_index:\s*\{/);
  const clip = pipelineStepKeys('clip');
  const siglip = pipelineStepKeys('siglip2');
  assert.equal(clip.includes('semantic_index'), false);
  assert.deepEqual(siglip.slice(siglip.indexOf('score'), siglip.indexOf('semantic_dedup') + 1),
    ['score', 'semantic_index', 'semantic_dedup']);
});
