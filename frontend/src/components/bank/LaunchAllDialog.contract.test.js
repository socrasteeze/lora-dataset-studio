/* 🚀 Launch all — the dialog must not promise a different run than it enqueues.
 *
 * Source-text contract, like semantic-dedup-ui.test.js: this dialog is JSX with
 * no extractable pure core, and the two defects it guards were both "the screen
 * said one thing and the POST said another".
 *
 * 1. The readiness map gated 🚩 Watermarks, 📐 Framing and 🏷️ Captions on the
 *    LOCAL vision model long after those three learned to travel. With a peer
 *    picked on a hub whose Ollama was down they arrived UNTICKED and badged
 *    "will skip" — for work the peer would have run happily.
 * 2. The button counted only the steps that would RUN while config() posted the
 *    full selection: "🚀 Launch 4 passes" enqueuing seven.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const src = fs.readFileSync(new URL('./LaunchAllDialog.jsx', import.meta.url), 'utf8');

const READY_BLOCK = src.slice(src.indexOf('const ready = useMemo'),
  src.indexOf('}), [caps, visionReady, remote])'));

test('every pass that can travel has the peer escape in the ready map', () => {
  // The five the backend routes on device_id (_run_pipeline_step).
  for (const key of ['score', 'faces', 'watermark', 'framing', 'caption']) {
    const line = READY_BLOCK.split('\n').find((l) => l.trim().startsWith(`${key}:`));
    assert.ok(line, `no ready entry for ${key}`);
    assert.match(line, /\|\| remote/,
      `${key} travels to a peer but is still gated on this machine only — `
      + 'it will arrive unticked and badged "will skip" for work the peer can do');
  }
});

test('the steps that never travel are NOT given the peer escape', () => {
  // scan / auto_reject are unconditionally true; semantic_dedup follows Score's
  // verdict because it consumes Score's embeddings, which a remote run brings
  // home. None of the three may claim a peer runs them.
  const note = src.slice(src.indexOf('run there — with its models'));
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
  const note = src.slice(src.indexOf('run there — with its models') - 400);
  for (const label of ['Score', 'Group by person', 'Watermarks', 'Framing', 'Captions']) {
    assert.ok(note.includes(label), `the note omits ${label}`);
  }
});
