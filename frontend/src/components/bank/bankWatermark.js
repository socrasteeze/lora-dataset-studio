/** 🚩 Bank watermark cleaning — the state of the two escalation levels (pure,
 * JSX-free so `node --test` exercises it directly).
 *
 * The feature is an ESCALATION, and the UI has to show where each level stands:
 * cheap and lossless first (crop off a border mark — invents no pixel), then the
 * expensive one (repaint what's left) on what the first level could not handle.
 * Both are launched by hand, so at every moment the panel must answer three
 * questions without the user guessing: how many images does THIS level still
 * have to work on, is the button live right now, and if not, WHY (and what to do
 * about it).
 *
 * Everything here derives from the /watermark/levels payload:
 *   flagged      — still carrying a watermark (both levels' pool)
 *   croppable    — of those, the ones the router would crop → level 2's share
 *   inpaintable  — the rest → level 3's share
 *   cropped / inpainted / dismissed — already handled, by which route
 *   needs_rescan — flagged by an older build with no box: nothing can route them
 */

const num = (v) => (Number.isFinite(v) ? v : 0);

/** Normalized counters — a missing/half-loaded payload reads as all-zero rather
 * than rendering NaNs. */
export function levelCounts(levels) {
  const l = levels || {};
  return {
    scanned: num(l.scanned),
    unscanned: num(l.unscanned),
    flagged: num(l.flagged),
    croppable: num(l.croppable),
    inpaintable: num(l.inpaintable),
    cropped: num(l.cropped),
    inpainted: num(l.inpainted),
    dismissed: num(l.dismissed),
    needsRescan: num(l.needs_rescan),
    // Flagged images whose zones the user drew by hand in ▶ Review, and how many
    // of those were emptied on purpose. Both change what the LEVELS will do, so
    // neither may stay invisible.
    handMasked: num(l.hand_masked),
    emptyMasks: num(l.empty_masks),
    // 🔤 Find text — the OCR pass's own tallies (its flagged rows are already
    // inside `flagged` above; these only drive its card's label and progress).
    textScanned: num(l.text?.scanned),
    textFound: num(l.text?.found),
    textUnscanned: num(l.text?.unscanned),
  };
}

/** 🔤 Find text — the OTHER detection on the same rung as 🚩 Find. Same ladder,
 * different instrument: it reads burned-in text (bubbles, subtitles, captions,
 * sound effects) with the RapidOCR engine the video lane ships and folds the
 * zones into the mask channel 🧽 Inpaint repaints. CPU-only by construction, so
 * the one install it can be missing is the `video_text` extra. */
export function textLevelState(levels, { live = false, ocrReady = false } = {}) {
  const c = levelCounts(levels);
  const reason = live
    ? 'A pass is already running.'
    : !ocrReady
      // The SAME extra the Video bank's Safe zone pass uses — one install
      // serves both, and naming the card is what makes the fix one click.
      ? 'Install Burned-in text in Setup ▸ Quality tools.'
      : null;
  return {
    done: c.textScanned,
    remaining: c.textUnscanned,
    disabled: reason !== null,
    reason,
    label: c.textUnscanned > 0 ? `🔤 Find Text (${c.textUnscanned})`
      : c.textScanned > 0 ? '🔤 Rescan Text' : '🔤 Find Text',
  };
}

/** Step 1 — FIND. Detection is the first rung of the same ladder, not a pass
 * that lives elsewhere: the two cleaning levels are dead without it (they route
 * on the box it stores), and splitting them across the page is what made the
 * feature read as two unrelated things.
 *
 * TWO routes can drive it. The dedicated detector extra, when installed, does not
 * need Ollama at all — so the "pull the vision model" refusal must NOT fire on a
 * machine that has the detector, or the fast route would be locked behind a
 * dependency it removed. */
export function findLevelState(levels, {
  live = false, visionReady = false, detectorReady = false,
} = {}) {
  const c = levelCounts(levels);
  const reason = live
    ? 'A pass is already running.'
    : !visionReady && !detectorReady
      // Settings ▸ Local tools, NOT ▸ Captioning & quality: that section holds the
      // ENGINE selector, while the Ollama vision model field lives in Local tools.
      // Sending someone to the wrong tab to fix a blocked pass is worse than silence.
      ? 'Pull a vision model in Settings or install the detector in Setup.'
      : null;
  return {
    done: c.scanned,
    // What is LEFT TO SCAN — not what was flagged. Detection resumes where a
    // stop left it, but a per-run progress bar restarting at 0 made that look
    // like a fresh start over already-analysed images. Naming the remainder is
    // what makes "it picked up where it stopped" visible.
    remaining: c.unscanned,
    disabled: reason !== null,
    reason,
    label: c.unscanned > 0 ? `🚩 Find Marks (${c.unscanned})`
      : c.scanned > 0 ? '🚩 Rescan Marks' : '🚩 Find Marks',
  };
}

/** Level 2 — auto-crop. Always available (CPU/PIL), so the only reasons it can
 * be off are "a pass is already running" and "nothing to crop".
 *
 * `binWaiting` is how many flagged images sit in the BIN — a pile this payload
 * cannot see (its pool has always been `status != 'reject'`). It exists because
 * the level now opens a window where the bin CAN be chosen: a button disabled on
 * "nothing to crop" would lock that choice away from exactly the user who needs
 * it, and a capability nobody can reach reads as one that was never shipped. */
export function cropLevelState(levels, { live = false, binWaiting = 0 } = {}) {
  const c = levelCounts(levels);
  const reason = live
    ? 'A pass is already running.'
    : (c.croppable === 0 && binWaiting > 0)
      ? null
      : c.croppable === 0
      ? (c.flagged > 0
        ? (c.handMasked >= c.flagged
          // A hand-drawn mask can hold several zones and zones on the subject —
          // a border crop expresses neither, so this level skips those images.
          // Saying "not in a border" there would be a lie.
          ? 'Use Inpaint for hand-edited masks.'
          : 'No safe border crop. Use Level 3.')
        : 'No flags. Run Find Marks.')
      : null;
  return {
    done: c.cropped,
    remaining: c.croppable,
    disabled: reason !== null,
    reason,
    // The bin is NAMED rather than folded into the total: "✂ Auto-crop (0)" on a
    // live button is a contradiction, and adding binWaiting to croppable would
    // add an unrouted figure to a routed one.
    label: c.croppable === 0 && binWaiting > 0
      ? `✂ Auto-Crop (${binWaiting})`
      : `✂ Auto-Crop (${c.croppable})`,
    // …and the line under the button follows the label. Leaving the default
    // "0 image(s) waiting" under a button offering 2 is the card contradicting
    // itself, which is exactly what the counts on this page exist to end.
    note: binWaiting > 0 && c.croppable === 0 ? binNote(binWaiting) : '',
  };
}


/** The line under a level whose only remaining work sits in the bin. */
function binNote(n) {
  return `${n} unkept. Select Unkept Only to run.`;
}

/** Level 3 — repaint. `method` is the engine toggle: 'lama' (or 'auto') repaints
 * small off-centre marks and leaves marks ON the subject flagged; 'klein' erases the
 * detected zones and hands the WHOLE photo to Flux.2 with the instruction to remove the
 * marks, which reaches those too — generatively, so it also clears what the scan missed
 * (a tiled mark) and can leave standing a mark nobody detected. It re-renders everything
 * else with them; utils/watermarkCleanEngine says all of that on screen, with the
 * measurements behind it.
 * An engine that isn't installed disables the button with the install path spelled
 * out — never a silent failure mid-pass. */
export function inpaintLevelState(levels, {
  live = false, method = 'auto', lamaReady = false, kleinReady = false,
  kleinReason = null, binWaiting = 0, deviceId = 'local',
} = {}) {
  const c = levelCounts(levels);
  const wantsKlein = method === 'klein';
  // A remote device (peer or api: backend) renders Klein on ITS machine, so the
  // LOCAL readiness verdict answers the wrong question there — that machine's
  // ComfyUI checks its own assets when the job arrives, and a missing model
  // fails the image with a reason. LaMa never travels, so ITS gate ignores the
  // picker entirely.
  const remote = !!deviceId && deviceId !== 'local';
  const engineReady = wantsKlein ? (kleinReady || remote) : lamaReady;
  // `kleinReason` is the ONE shared sentence (utils/localEngineReason) naming the
  // actual gap — a stopped ComfyUI, a named missing weight, a present-but-broken
  // one, a widget value this install does not have. The catch-all below is only
  // the fallback for a caller that has no capabilities payload to reason from;
  // "needs ComfyUI running and the Klein models" sends a user with a corrupted
  // 9.5 GB file to re-check the two things that were already fine.
  const reason = live
    ? 'A pass is already running.'
    : !engineReady
      ? (wantsKlein
        ? (kleinReason
          || 'Start ComfyUI and install the Klein models in Setup.')
        : 'Install LaMa in Setup ▸ Quality tools.')
      : (c.flagged === 0 && binWaiting > 0)
        ? null                      // see cropLevelState: the bin is reachable now
        : c.flagged === 0
          ? (c.cropped > 0
            ? 'All flagged images handled.'
            : 'No flags. Run Find Marks.')
          : null;
  // Stated even when the button is live: the local verdict said "not ready",
  // and the only reason the pass can still run is that another machine will do
  // the rendering — that swap must never be silent.
  const remoteNote = wantsKlein && remote && !kleinReady
    ? 'The selected machine checks Klein readiness.'
    : null;
  return {
    done: c.inpainted,
    remaining: c.flagged,
    disabled: reason !== null,
    reason,
    remoteNote,
    label: c.flagged === 0 && binWaiting > 0
      ? `🧽 Inpaint (${binWaiting})`
      : `🧽 Inpaint (${c.flagged})`,
    note: binWaiting > 0 && c.flagged === 0 && engineReady ? binNote(binWaiting) : '',
  };
}

/** True once anything has been cleaned — the Undo affordance's condition. */
export function hasCleanedImages(levels) {
  const c = levelCounts(levels);
  return c.cropped + c.inpainted > 0;
}

/** Compact scan and repaint counts. Flagged and croppable are on the controls. */
export function progressSummary(levels) {
  const c = levelCounts(levels);
  const counts = [`${c.scanned}/${c.scanned + c.unscanned} scanned`];
  if (c.textScanned) counts.push(`${c.textScanned} text-scanned`);
  if (c.inpaintable) counts.push(`${c.inpaintable} to repaint`);
  if (c.cropped) counts.push(`${c.cropped} cropped`);
  if (c.inpainted) counts.push(`${c.inpainted} repainted`);
  if (c.dismissed) counts.push(`${c.dismissed} dismissed`);
  return counts.join(' · ');
}

/** What the hand-edited masks change, or null. An emptied mask repaints NOTHING:
 * that image would otherwise sit in the flagged count forever, looking like a
 * pass that keeps failing on it. */
export function maskNote(levels) {
  const c = levelCounts(levels);
  if (!c.handMasked) return null;
  if (c.emptyMasks) return `${c.emptyMasks} empty mask${c.emptyMasks === 1 ? '' : 's'}`;
  return `${c.handMasked} hand-masked`;
}

/** Rows a previous build flagged without keeping the box: they are invisible to
 * both levels until a scan re-adopts them, so say it instead of losing them. */
export function rescanNote(levels) {
  const c = levelCounts(levels);
  if (!c.needsRescan) return null;
  return `Rescan ${c.needsRescan} flagged images to locate their marks.`;
}
