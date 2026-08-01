/* 🚀 Launch all — the dialog must not promise a different run than it enqueues.
 *
 * Source-text contract, like semantic-dedup-ui.test.js: this dialog is JSX with
 * no extractable pure core, and the two defects it guards were both "the screen
 * said one thing and the POST said another".
 *
 * 1. The readiness map gated 🚩 Watermarks, 📐 Framing and 🏷️ Captions on the
 *    LOCAL vision model long after those three learned to travel. With a peer
 *    picked on a hub whose Ollama was down they arrived UNTICKED and badged
 *    "will skip" — for work the peer would have run happily. Its first fix,
 *    `|| remote`, over-corrected into the opposite lie: a truthy device id
 *    ticked ✨ Score on a peer that had already reported no scoring stack. The
 *    verdict must come from the SELECTED machine's own capabilities, which is
 *    what passDeviceGate.stepGate answers.
 * 2. The button counted only the steps that would RUN while config() posted the
 *    full selection: "🚀 Launch 4 passes" enqueuing seven.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const src = fs.readFileSync(new URL('./LaunchAllDialog.jsx', import.meta.url), 'utf8');

test('readiness is decided by the selected device, not by "a peer exists"', () => {
  assert.match(src, /import \{ stepGate \} from '\.\/passDeviceGate\.js'/);
  const gates = src.slice(src.indexOf('const gates = useMemo'),
    src.indexOf('const ready = useMemo'));
  for (const key of ['score', 'faces', 'watermark', 'framing', 'caption']) {
    assert.ok(gates.includes(`'${key}'`), `${key} is not gated at all`);
  }
  assert.match(gates, /stepGate\(k, \{ caps, visionReady, device \}\)/);
  // Comments stripped: the header above `gates` explains the old `|| remote`
  // by name, and that prose is worth keeping.
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /\|\| remote/,
    'a truthy device id is not evidence that THAT machine can run the pass');
});

test('a pass the chosen machine refuses is disabled, not merely badged', () => {
  assert.match(src, /disabled=\{!!gates\[s\.key\]\?\.blocked\}/,
    'the checkbox must be unclickable — an amber "will skip" badge on a pass '
    + 'the peer flatly cannot run is the same lie in a quieter font');
  assert.match(src, /filter\(\(k\) => !gates\[k\]\?\.blocked\)/,
    'a blocked pass must be unticked, or config() posts a run the API refuses');
  assert.match(src, /if \(gates\[k\]\?\.blocked\) return prev/,
    'toggleStep must refuse a blocked pass too, not only the disabled input');
});

test('the device the picker resolved reaches the dialog, not just its id', () => {
  // The id normally comes back from localStorage, so onChange never fires for
  // it — a restored peer is exactly the selection that must be gated.
  assert.match(src, /onDevice=\{setDevice\}/);
});

test('the steps that never travel are NOT given the peer escape', () => {
  // scan / auto_reject are unconditionally true; semantic_dedup follows Score's
  // verdict because it consumes Score's embeddings, which a remote run brings
  // home. None of the three may claim a peer runs them.
  const note = src.slice(src.indexOf('can run there'));
  assert.match(note, /Scan.*Auto-reject.*Same shot always run here/s,
    'the note must name the passes that never travel, not only the ones that do');
});

test('the button cannot understate what config() sends', () => {
  // config() posts [...steps] — every picked step, including ones that will be
  // skipped, because the backend records those in pipeline_report and that is
  // what lets a bank card admit a pass did not happen.
  assert.match(src, /steps: \[\.\.\.steps\]/);
  assert.match(src, /const nSent = plan\.length/);
  // …so the label must reconcile the two rather than showing only nRun.
  assert.match(src, /nRun === nSent \? nRun : `\$\{nRun\} of \$\{nSent\}`/,
    'the button shows only the runnable count while sending more');
});

test('the note names all five travelling passes', () => {
  const at = src.indexOf('can run there');
  assert.ok(at > 0, 'the remote note is gone');
  const note = src.slice(at - 400);
  for (const label of ['Score', 'Group by person', 'Watermarks', 'Framing', 'Captions']) {
    assert.ok(note.includes(label), `the note omits ${label}`);
  }
  // …and stops promising they all run there regardless of what that machine is.
  assert.match(note.slice(0, 600), /only if that machine reports the stack/);
});
