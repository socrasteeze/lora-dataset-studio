import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDIT_ENGINES, defaultEditEngine, editBlockedReason, editEngineChoiceMessage,
  batchLiveNote, editPhase, editEngineOptions, editCostNote, editKeepNote,
  editRefNote, acceptsExtraEditRefs, acceptsExtraEditRefsForBatch, editRefSupport,
  editBatchBlockedReason, referenceEditCandidates,
  retryRequestForReferenceEdit,
} from './referenceEdit.js';
import {
  STORAGE_ENGINES, STORAGE_PRIMARY, ENGINES, API_ENGINES, LOCAL_ENGINES, ENGINE_LABELS,
  DEFAULT_ENGINE,
} from './engineSelection.js';

function fakeStorage(seed = {}) {
  const data = { ...seed };
  return { getItem(k) { return k in data ? data[k] : null; }, setItem(k, v) { data[k] = String(v); } };
}

/* This file must NOT pin a fixed length. Upstream's first assertion here said
   "exactly these two", which is why a third generation engine left the Edit modal
   silently one engine short; its replacement then said "Klein is OUT", which
   outlived its own reason — the exclusion was about the edit being a BLOCKING
   provider call, and a local edit now waits on the ComfyUI queue like every other
   local render. Derive, never enumerate. */
test('every engine this fork ships can edit the reference', () => {
  assert.ok(EDIT_ENGINES.includes('klein'));
  assert.ok(EDIT_ENGINES.includes('krea'));
});

test('EDIT_ENGINES is derived from ENGINES, so it cannot drift from it', () => {
  assert.deepEqual(EDIT_ENGINES, [...ENGINES]);
  // A copy, not an alias: mutating the edit list must not reach the generation one.
  assert.notEqual(EDIT_ENGINES, ENGINES);
});

/* Divergence 1: the edit lane is local-only here, and it is local BY CONSTRUCTION
   rather than by a fork-specific filter. editable_engines() on the backend is
   upstream's `LOCAL_ENGINES + API_ENGINES` verbatim and answers correctly only
   because API_ENGINES is empty — this test is what keeps that true, so a future
   sync cannot quietly reintroduce a paid edit lane through the derived list. */
test('no API engine can reach the edit lane', () => {
  assert.deepEqual([...API_ENGINES], [], 'API_ENGINES must stay empty (Divergence 1b)');
  assert.deepEqual(EDIT_ENGINES, [...LOCAL_ENGINES]);
});

test('defaultEditEngine mirrors the primary generation engine when it can edit', () => {
  // NB: primaryEngine is first in CANONICAL order, not stored order — storing
  // ['krea','klein'] still yields 'klein'. Select krea alone to make it primary.
  assert.equal(defaultEditEngine(fakeStorage({ [STORAGE_ENGINES]: JSON.stringify(['krea']) })),
    'krea');
  assert.equal(defaultEditEngine(fakeStorage({ [STORAGE_ENGINES]: JSON.stringify(['krea', 'klein']) })),
    'klein');
});

test('defaultEditEngine opens on Klein when Klein is the primary generation engine', () => {
  const storage = fakeStorage({ [STORAGE_PRIMARY]: 'klein' });
  assert.equal(defaultEditEngine(storage), 'klein');
});

test('defaultEditEngine skips a primary this install cannot run', () => {
  const storage = fakeStorage({ [STORAGE_PRIMARY]: 'klein' });
  // Klein stored but unusable → must not open on a disabled button.
  assert.equal(defaultEditEngine(storage, (e) => e !== 'klein'), 'krea');
});

/* Merge diagnostic 10: upstream's fallback here is a hardcoded cloud engine id.
   Inheriting it would open the modal on an engine that does not exist on this
   fork and that no route accepts — a default recomputed, not copied. */
test('with no stored preference the fallback is a real engine of THIS fork', () => {
  assert.equal(defaultEditEngine(fakeStorage()), DEFAULT_ENGINE);
  assert.ok(EDIT_ENGINES.includes(defaultEditEngine(fakeStorage())));
});

test('when nothing is usable the fallback is still an engine, never undefined', () => {
  // A modal opened on `undefined` would send an empty engine the route rejects.
  assert.equal(defaultEditEngine(fakeStorage(), () => false), DEFAULT_ENGINE);
});

test('editBlockedReason blocks an empty prompt and an un-editable engine', () => {
  assert.match(editBlockedReason('', 'klein'), /Describe the edit/);
  assert.match(editBlockedReason('   ', 'klein'), /Describe the edit/);
  assert.equal(editBlockedReason('add glasses', 'klein'), null);
  // A stored legacy tag from a removed engine must be refused, not run.
  assert.equal(editBlockedReason('add glasses', 'nanobanana'), editEngineChoiceMessage());
});

test('editBlockedReason surfaces WHY an engine is unavailable, before the click', () => {
  // The engine reason wins over the prompt: typing would not install a node pack.
  const reason = '⚠ Krea node pack missing — install it in Setup';
  assert.equal(editBlockedReason('', 'krea', reason), reason);
  assert.equal(editBlockedReason('add glasses', 'krea', reason), reason);
});

test('a multi-engine batch requires a selection and gates every selected blocked engine', () => {
  // Upstream's fixture picks chatgpt as the un-blocked engine; the engines that
  // exist here are klein and krea, so the same three gates are asserted on those.
  const options = [
    { engine: 'klein', blocked: null },
    { engine: 'krea', blocked: '⚠ Krea model missing' },
  ];
  assert.match(editBatchBlockedReason('add glasses', [], options), /at least one/i);
  assert.match(editBatchBlockedReason('', ['klein'], options), /describe/i);
  assert.equal(editBatchBlockedReason('add glasses', ['klein'], options), null);
  assert.match(editBatchBlockedReason('add glasses', ['klein', 'krea'], options),
    /Krea model missing/);
});

test('the refusal names the engines that DO edit, derived from the list', () => {
  const msg = editEngineChoiceMessage();
  for (const e of EDIT_ENGINES) assert.ok(msg.includes(ENGINE_LABELS[e]), e);
});

/* ── What an engine does differently, said before the click ────────────────── */

test('an install with no ComfyUI is offered no engine at all', () => {
  // Not a gap to fix from this modal — a product the user hasn't got. Permanently
  // dead buttons would be worse than none. (Upstream still lists its API engines
  // here; with none left, the honest answer is an empty list.)
  assert.deepEqual(editEngineOptions({ comfyuiConfigured: false }), []);
});

test('a configured ComfyUI keeps the engines VISIBLE and says what to do', () => {
  const opts = editEngineOptions({
    comfyuiConfigured: true,
    available: { klein: true, krea: false },
    reasonFor: (e) => (e === 'krea' ? '⚠ Krea base model missing — Setup can download it' : null),
  });
  const krea = opts.find((o) => o.engine === 'krea');
  assert.ok(krea, 'a fixable gap must not hide the engine');
  assert.equal(krea.usable, false);
  assert.match(krea.blocked, /Setup can download/);
  assert.equal(opts.find((o) => o.engine === 'klein').usable, true);
});

test('an unavailable engine is never silently offered as usable', () => {
  // No diagnostic available (older server, unknown gap): still says something,
  // still not usable. Silence is the failure mode being removed.
  const opts = editEngineOptions({ comfyuiConfigured: true, available: {} });
  for (const e of LOCAL_ENGINES) {
    const o = opts.find((x) => x.engine === e);
    assert.equal(o.usable, false, e);
    assert.ok(o.blocked && o.blocked.length, e);
  }
});

test('the cost line never invents a price for a local render', () => {
  // Upstream states "Each edit is a paid API call" unconditionally; on a local
  // render that is simply false, and a price quoted on a free render damages
  // trust as much as one hidden on a paid render. ("no bill" is the point, so
  // the word may appear — a CHARGE being claimed is what must not.)
  for (const e of EDIT_ENGINES) {
    const note = editCostNote(e);
    assert.match(note, /own ComfyUI/, e);
    assert.match(note, /no bill/, e);
    assert.doesNotMatch(note, /paid|refund|costs? \$|per edit/i, e);
  }
});

test('a multi-engine cost note counts the renders and still quotes no price', () => {
  // Upstream splits this line into paid calls and free local renders. There is
  // no paid half here, and inventing one would be the same lie in reverse — so
  // the note counts the queue and says plainly that none of it is billed.
  const note = editCostNote(['klein', 'krea']);
  assert.match(note, /2 edits/);
  assert.match(note, /no bill/);
  assert.doesNotMatch(note, /paid|API call|refund/i);
});

test('the Keep line does not claim a refund that never applied', () => {
  const note = editKeepNote();
  assert.match(note, /costs you nothing/);
  assert.doesNotMatch(note, /refund/i);
  assert.match(note, /can’t be undone/);
});

test('an engine that takes fewer references SAYS so at pick time', () => {
  assert.equal(editRefSupport('klein'), 'dataset_only');
  assert.equal(editRefSupport('krea'), 'primary_only');
  assert.match(editRefNote('klein', { datasetExtraCount: 2 }), /2 extra reference photos/);
  assert.match(editRefNote('klein', { datasetExtraCount: 1 }), /1 extra reference photo\b/);
  assert.match(editRefNote('krea', { datasetExtraCount: 2 }), /main reference only/);
});

/* Upstream defaults an unknown engine to 'all' — "takes the primary, the dataset
   extras AND transient uploads". No engine here can take transient bytes (the
   route refuses them), so inheriting that default would have the UI promise a
   capability nothing implements. The conservative default is the honest one. */
test('an unknown engine defaults to the CONSERVATIVE reference support', () => {
  assert.equal(editRefSupport('something-else'), 'primary_only');
  assert.match(editRefNote('something-else'), /main reference only/);
});

test('the transient reference picker is hidden — no engine here can take it', () => {
  // Hidden, not ignored: an input whose files are silently dropped returns an
  // edit that used half of what the user handed it. Both local engines refuse,
  // so the batch answer is false however they are combined.
  assert.equal(acceptsExtraEditRefs('klein'), false);
  assert.equal(acceptsExtraEditRefs('krea'), false);
  assert.equal(acceptsExtraEditRefsForBatch(['klein', 'krea']), false);
  assert.equal(acceptsExtraEditRefsForBatch([]), false);
});

test('batchLiveNote informs only while a generate batch runs, never blocks', () => {
  assert.equal(batchLiveNote(null), null);
  assert.equal(batchLiveNote({ kind: 'caption' }), null);
  assert.match(batchLiveNote({ kind: 'generate' }), /only future batches/);
});

test('editPhase derives the modal phase from the server reference_edit object', () => {
  assert.equal(editPhase(null), 'idle');
  assert.equal(editPhase({}), 'idle');
  assert.equal(editPhase({ status: 'running' }), 'running');
  assert.equal(editPhase({ status: 'ready' }), 'ready');
  assert.equal(editPhase({ status: 'failed' }), 'failed');
  assert.equal(editPhase({ status: 'nonsense' }), 'idle');
});

test('per-engine candidates preserve selection order and keep partial success usable', () => {
  const batch = {
    engines: ['chatgpt', 'klein', 'openrouter'],
    candidates: {
      chatgpt: { status: 'ready', candidate_filename: 'chat.webp' },
      klein: { status: 'failed', error: 'GPU failed' },
      openrouter: { status: 'ready', candidate_filename: 'router.webp' },
    },
  };
  const candidates = referenceEditCandidates(batch);
  assert.deepEqual(candidates.map((candidate) => candidate.engine),
    ['chatgpt', 'klein', 'openrouter']);
  assert.deepEqual(candidates.filter((candidate) => candidate.status === 'ready')
    .map((candidate) => candidate.candidate_filename), ['chat.webp', 'router.webp']);
  assert.equal(editPhase(batch), 'ready');
});

test('legacy one-engine payload still normalizes to one candidate', () => {
  assert.deepEqual(referenceEditCandidates({
    status: 'ready', engine: 'chatgpt', candidate_filename: 'old.webp', error: null,
  }), [{
    engine: 'chatgpt', status: 'ready', candidate_filename: 'old.webp', error: null,
  }]);
});

test('an exact Retry belongs only to the opaque batch currently displayed', () => {
  const request = {
    prompt: 'add glasses',
    engines: ['chatgpt', 'openrouter'],
    files: [{ name: 'angle.png' }],
    batchId: 'batch-A',
  };
  assert.equal(
    retryRequestForReferenceEdit(request, { batch_id: 'batch-A' }),
    request,
  );
  assert.equal(
    retryRequestForReferenceEdit(request, { batch_id: 'batch-B' }),
    null,
  );
  assert.equal(retryRequestForReferenceEdit(request, null), null);
  assert.equal(
    retryRequestForReferenceEdit({ ...request, batchId: null }, { batch_id: 'batch-A' }),
    null,
  );
});
