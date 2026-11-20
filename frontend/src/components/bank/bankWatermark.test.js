import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cropLevelState, findLevelState, hasCleanedImages, inpaintLevelState, levelCounts,
  maskNote, progressSummary, rescanNote, textLevelState,
} from './bankWatermark.js';

const levels = (over = {}) => ({
  scanned: 10, flagged: 4, croppable: 1, inpaintable: 3,
  cropped: 0, inpainted: 0, dismissed: 0, needs_rescan: 0, ...over,
});

test('levelCounts: a missing payload reads as zeros, never NaN', () => {
  assert.deepEqual(levelCounts(null), {
    scanned: 0, unscanned: 0, flagged: 0, croppable: 0, inpaintable: 0,
    cropped: 0, inpainted: 0, dismissed: 0, needsRescan: 0,
    handMasked: 0, emptyMasks: 0,
    textScanned: 0, textFound: 0, textUnscanned: 0,
  });
  assert.equal(levelCounts({ flagged: 'x' }).flagged, 0);
});

test('🔤 text card: fresh → Find text, resumes by the remainder, rescans when done', () => {
  const fresh = textLevelState(levels({ text: { scanned: 0, found: 0, unscanned: 12 } }),
    { ocrReady: true });
  assert.equal(fresh.disabled, false);
  assert.equal(fresh.label, '🔤 Find Text (12)');
  assert.equal(fresh.remaining, 12);
  const partial = textLevelState(
    levels({ text: { scanned: 30, found: 4, unscanned: 8 } }), { ocrReady: true });
  assert.equal(partial.label, '🔤 Find Text (8)');
  const done = textLevelState(
    levels({ text: { scanned: 38, found: 6, unscanned: 0 } }), { ocrReady: true });
  assert.equal(done.label, '🔤 Rescan Text');
  assert.equal(done.done, 38);
});

test('🔤 text card: the OCR extra missing names the Setup card, live blocks it', () => {
  const off = textLevelState(levels(), { ocrReady: false });
  assert.equal(off.disabled, true);
  assert.match(off.reason, /Burned-in text/);
  assert.match(off.reason, /Setup/);
  const busy = textLevelState(levels({ text: { scanned: 0, found: 0, unscanned: 5 } }),
    { live: true, ocrReady: true });
  assert.equal(busy.disabled, true);
  assert.match(busy.reason, /already running/);
});

test('hand-edited masks are reported, and an EMPTY one is called out', () => {
  assert.equal(maskNote(levels()), null);            // nothing edited → no noise
  const drawn = maskNote(levels({ hand_masked: 3 }));
  assert.equal(drawn, '3 hand-masked');
  const emptied = maskNote(levels({ hand_masked: 3, empty_masks: 1 }));
  assert.equal(emptied, '1 empty mask');
});

test('crop off because every flagged image is hand-masked says THAT, not "no border"', () => {
  const s = cropLevelState(levels({ flagged: 2, croppable: 0, hand_masked: 2 }));
  assert.equal(s.disabled, true);
  assert.match(s.reason, /hand-edited mask/);
  assert.doesNotMatch(s.reason, /border/);
  // A partially hand-masked pool keeps the ordinary explanation.
  assert.match(cropLevelState(levels({ flagged: 2, croppable: 0, hand_masked: 1 })).reason,
    /border/);
});

test('level 1 is live whenever something is croppable — it needs no model at all', () => {
  const s = cropLevelState(levels(), { live: false });
  assert.equal(s.disabled, false);
  assert.equal(s.reason, null);
  assert.equal(s.remaining, 1);
  assert.match(s.label, /Auto-Crop \(1\)/);
});

test('crop off with marks left says to escalate, not just "disabled"', () => {
  const s = cropLevelState(levels({ croppable: 0 }));
  assert.equal(s.disabled, true);
  // Points at INPAINT. Once Find became level 1 this hint still said "level 2",
  // i.e. it sent the user back to the very card they were reading.
  assert.match(s.reason, /level 3/i);
  assert.doesNotMatch(s.reason, /level 2/i);
});

test('level 1 off with nothing flagged points at the scan', () => {
  assert.match(cropLevelState(levels({ flagged: 0, croppable: 0 })).reason,
    /Find Marks/);
});

test('a running pass disables both levels with the same honest reason', () => {
  assert.match(cropLevelState(levels(), { live: true }).reason, /already running/);
  assert.match(inpaintLevelState(levels(), { live: true, lamaReady: true }).reason,
    /already running/);
});

test('level 2 spells out the install path per engine instead of failing later', () => {
  const noLama = inpaintLevelState(levels(), { lamaReady: false });
  assert.equal(noLama.disabled, true);
  assert.match(noLama.reason, /LaMa.*Quality tools/);

  const noKlein = inpaintLevelState(levels(), {
    method: 'klein', lamaReady: true, kleinReady: false,
  });
  assert.equal(noKlein.disabled, true);
  assert.match(noKlein.reason, /ComfyUI/);
});

test('level 2 works on everything still flagged, not only the non-croppable share', () => {
  // Running level 2 without level 1 must not silently ignore border marks:
  // the backend repaints them (allow_crop=False), so the count says 4, not 3.
  const s = inpaintLevelState(levels(), { lamaReady: true });
  assert.equal(s.disabled, false);
  assert.equal(s.remaining, 4);
  assert.match(s.label, /Inpaint \(4\)/);
});

test('level 2 with Klein selected only needs Klein', () => {
  const s = inpaintLevelState(levels(), {
    method: 'klein', lamaReady: false, kleinReady: true,
  });
  assert.equal(s.disabled, false);
});

test('an emptied pool reads as "done", not as "never ran"', () => {
  const done = inpaintLevelState(levels({ flagged: 0, cropped: 3 }), { lamaReady: true });
  assert.match(done.reason, /All flagged images handled/);
  const never = inpaintLevelState(levels({ flagged: 0, cropped: 0 }), { lamaReady: true });
  assert.match(never.reason, /Find Marks/);
});

test('progressSummary tells done-vs-left, and an unscanned bank says so', () => {
  assert.equal(progressSummary(null), '0/0 scanned');
  assert.equal(progressSummary(levels()), '10/10 scanned · 3 to repaint');
  const mid = progressSummary(levels({ cropped: 2, inpainted: 1, dismissed: 1, inpaintable: 0 }));
  assert.match(mid, /2 cropped · 1 repainted · 1 dismissed/);
});

test('undo only offered once something was actually cleaned', () => {
  assert.equal(hasCleanedImages(levels()), false);
  assert.equal(hasCleanedImages(levels({ cropped: 1 })), true);
  assert.equal(hasCleanedImages(levels({ inpainted: 2 })), true);
});

test('images flagged before boxes were stored are named, never silently stuck', () => {
  assert.equal(rescanNote(levels()), null);
  assert.match(rescanNote(levels({ needs_rescan: 7 })), /Rescan 7 flagged images/);
});


// --- step 1: FIND -----------------------------------------------------------
// Detection belongs to the same ladder as the two cleaning levels: it is what
// records the box they route on. Splitting it off the panel is what made the
// feature read as two unrelated things, so its state is modelled here too.

test('find is offered when the vision model is ready, and names a rescan once scanned', () => {
  const fresh = findLevelState(levels({ scanned: 0, flagged: 0 }), { visionReady: true });
  assert.equal(fresh.disabled, false);
  assert.equal(fresh.label, '🚩 Find Marks');

  const again = findLevelState(levels({ unscanned: 0 }), { visionReady: true });
  assert.equal(again.disabled, false);
  assert.equal(again.label, '🚩 Rescan Marks');
  assert.equal(again.done, 10);
});

test('a STOPPED scan says what is left, never what was flagged', () => {
  // The regression this guards: a resumed scan looked like it restarted from
  // zero over already-analysed images. The count that dispels it is the number
  // left to LOOK AT (unscanned), not the number found to be watermarked.
  const s = findLevelState(levels({ scanned: 3092, unscanned: 248, flagged: 92 }),
    { visionReady: true });
  assert.equal(s.done, 3092);
  assert.equal(s.remaining, 248);               // NOT 92
  assert.equal(s.label, '🚩 Find Marks (248)');
});

test('a partial scan is reported as partial, not as a finished pass', () => {
  const line = progressSummary(levels({ scanned: 4351, unscanned: 12981, flagged: 2756 }));
  assert.match(line, /4351\/17332 scanned/);
});

test('find is off without the vision model, and says where to get it', () => {
  const s = findLevelState(levels(), { visionReady: false });
  assert.equal(s.disabled, true);
  assert.match(s.reason, /vision model/i);
  assert.match(s.reason, /Settings/);           // actionable, never a bare "unavailable"
});

test('find stays ON without the vision model when the detector is installed', () => {
  // The detector needs no Ollama at all. Keeping the old refusal would lock the
  // fast route behind the very dependency it removes.
  const s = findLevelState(levels(), { visionReady: false, detectorReady: true });
  assert.equal(s.disabled, false);
  assert.equal(s.reason, null);
});

test('with neither route, the refusal names BOTH ways out', () => {
  const s = findLevelState(levels(), { visionReady: false, detectorReady: false });
  assert.equal(s.disabled, true);
  assert.match(s.reason, /vision model/i);
  assert.match(s.reason, /detector/i);
  assert.match(s.reason, /Setup/);
});

test('find is off while another pass runs on the bank', () => {
  const s = findLevelState(levels(), { visionReady: true, live: true });
  assert.equal(s.disabled, true);
  assert.match(s.reason, /already running/i);
});

test('find survives a missing payload (bank never scanned)', () => {
  const s = findLevelState(null, { visionReady: true });
  assert.equal(s.disabled, false);
  assert.equal(s.done, 0);
  assert.equal(s.label, '🚩 Find Marks');
});


// ── Run-on device: only the Klein render travels ─────────────────────────

test('a remote device unlocks Klein even when the LOCAL verdict is not-ready', () => {
  const s = inpaintLevelState(levels(), {
    method: 'klein', kleinReady: false, kleinReason: 'ComfyUI is not running.',
    deviceId: 'api:abc123def456',
  });
  assert.equal(s.disabled, false);
  // …and the swap is never silent: the note says WHERE readiness gets checked.
  assert.match(s.remoteNote, /selected machine/);
});

test('a remote device with local Klein ready needs no note', () => {
  const s = inpaintLevelState(levels(), {
    method: 'klein', kleinReady: true, deviceId: 'api:abc123def456',
  });
  assert.equal(s.disabled, false);
  assert.equal(s.remoteNote, null);
});

test('LaMa ignores the device pick — its gate answers THIS machine', () => {
  const s = inpaintLevelState(levels(), {
    method: 'auto', lamaReady: false, deviceId: 'api:abc123def456',
  });
  assert.equal(s.disabled, true);
  assert.match(s.reason, /LaMa/);
});

test('device "local" (or absent) keeps the historical Klein gate', () => {
  const off = inpaintLevelState(levels(), {
    method: 'klein', kleinReady: false, kleinReason: 'ComfyUI is not running.',
    deviceId: 'local',
  });
  assert.equal(off.disabled, true);
  assert.match(off.reason, /ComfyUI is not running/);
  const legacy = inpaintLevelState(levels(), {
    method: 'klein', kleinReady: false, kleinReason: 'ComfyUI is not running.',
  });
  assert.equal(legacy.disabled, true);
});
