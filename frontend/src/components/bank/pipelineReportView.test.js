import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isSuperseded, reportHeadline, STATUS_STYLE, stepView } from './pipelineReportView.js';

const cancelled = (step, extra = {}) => ({
  step, status: 'cancelled', reason: 'cancelled before it ran', ...extra,
});

test('a step re-run since the report no longer speaks for it', () => {
  const view = stepView(cancelled('semantic_dedup', {
    superseded_at: 2, superseded_detail: 'done — 2358 semantic near-duplicate group(s)',
  }));
  assert.equal(view.superseded, true);
  assert.equal(view.icon, '🔄');
  assert.match(view.note, /re-run since/);
  assert.match(view.note, /2358/, 'the fresher result is what the row should show');
  assert.doesNotMatch(view.note, /cancelled before it ran/);
});

test('a step nobody re-ran keeps its verdict, word for word', () => {
  const view = stepView(cancelled('scan'));
  assert.equal(view.superseded, false);
  assert.equal(view.icon, '🛑');
  assert.equal(view.note, 'cancelled before it ran');
});

test('a re-run with no recorded detail still reads as re-run', () => {
  const view = stepView(cancelled('faces', { superseded_at: 9 }));
  assert.equal(view.superseded, true);
  assert.equal(view.note, 're-run since this report');
});

test('a done step is never marked superseded — it has nothing to be corrected about', () => {
  assert.equal(isSuperseded({ step: 'score', status: 'done', superseded_at: 5 }), false);
  const view = stepView({ step: 'score', status: 'done', detail: 'scored 12 image(s)' });
  assert.equal(view.icon, '✅');
  assert.equal(view.note, 'scored 12 image(s)');
});

test('the banner drops the 🛑 once every stopped step has been redone', () => {
  const report = {
    cancelled: true,
    steps: [
      { step: 'score', status: 'done', detail: 'scored 12' },
      cancelled('semantic_dedup', { superseded_at: 2, superseded_detail: 'done — 3 group(s)' }),
    ],
  };
  const head = reportHeadline(report);
  assert.equal(head.stopped, false);
  assert.equal(head.icon, '🚀');
  assert.equal(head.covered, 2, 'both passes have run, one of them later');
  assert.equal(head.redone, 1);
});

test('the 🛑 survives as long as one pass is still waiting to be run', () => {
  const report = {
    cancelled: true,
    steps: [
      cancelled('semantic_dedup', { superseded_at: 2 }),
      cancelled('caption'),
    ],
  };
  const head = reportHeadline(report);
  assert.equal(head.stopped, true);
  assert.equal(head.icon, '🛑');
  assert.equal(head.covered, 1);
});

test('an empty or malformed report never throws', () => {
  assert.equal(stepView(null), null);
  assert.equal(reportHeadline(null).total, 0);
  assert.equal(reportHeadline({ steps: 'nope' }).total, 0);
  assert.equal(reportHeadline({ cancelled: true, steps: [] }).stopped, false);
});

// The component must actually USE the module, or these tests grade a file nobody
// renders — the failure mode this repo has hit before.
test('PipelineReport renders through the shared view logic', () => {
  const src = fs.readFileSync(new URL('./PipelineReport.jsx', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/pipelineReportView\.js'/);
  assert.match(src, /stepView\(/);
  assert.match(src, /reportHeadline\(/);
  assert.doesNotMatch(src, /const STATUS_STYLE = \{/,
    'the styles moved to the view module — two copies would drift');
});

// A step that RAN but finished short or mixed must not wear the same ✅ as a
// clean one, and the headline says how many need a look.
const shortCaption = {
  step: 'caption', status: 'done', reason: null,
  detail: 'done — 997 captioned (135 by JoyCaption, 862 by the local LLM vision model)',
  counts: { joycaption: 135, ollama: 862, skipped: 3, failed: 0, first_choice: 'joycaption' },
};

test('a caption step that needs attention does not show a ✅', () => {
  const view = stepView(shortCaption);
  assert.notEqual(view.icon, '✅');
  assert.equal(view.icon, STATUS_STYLE.attention.icon);
  assert.equal(view.cls, STATUS_STYLE.attention.cls);
  assert.equal(view.attention, true);
  assert.match(view.note, /862 by the local LLM/, 'the step keeps its own detail line');
});

test('a clean caption step keeps its ✅', () => {
  const view = stepView({ step: 'caption', status: 'done', detail: 'done — 5 captioned',
    counts: { joycaption: 5, ollama: 0, skipped: 0, failed: 0, first_choice: 'joycaption' } });
  assert.equal(view.icon, '✅');
  assert.equal(view.attention, false);
});

test('the headline reads "8/8 ran · 1 needs attention"', () => {
  const done = (step) => ({ step, status: 'done', detail: 'ok' });
  const report = { steps: [
    done('scan'), done('auto_reject'), done('score'), done('semantic_dedup'),
    done('watermark'), done('faces'), done('framing'), shortCaption,
  ] };
  const head = reportHeadline(report);
  assert.equal(head.covered, 8);
  assert.equal(head.total, 8);
  assert.equal(head.attention, 1);
  assert.equal(head.attentionLabel, '1 needs attention');
  assert.equal(reportHeadline({ steps: [done('scan')] }).attentionLabel, '');
  assert.equal(reportHeadline({ steps: [shortCaption, shortCaption] }).attentionLabel,
    '2 need attention');
});

test('PipelineReport shows the attention count in its headline', () => {
  const src = fs.readFileSync(new URL('./PipelineReport.jsx', import.meta.url), 'utf8');
  assert.match(src, /attentionLabel/);
});
