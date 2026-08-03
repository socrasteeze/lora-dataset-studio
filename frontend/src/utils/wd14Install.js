// 🔖 The WD14 tagger as an OPTIONAL, contextually-offered extra.
// PURE JS (JSX-free) so node --test can import it.
//
// Same shape as faceDetectionInstall.js, and for the same reasons — but with
// one difference worth stating, because it changes what "installed" means here.
//
// Every other ML extra is pip-only: pip succeeded == the capability works. This
// one also needs ~400 MB of model weights, so the server's probe requires BOTH
// halves and its install action does both. That is why `detail` from the server
// is surfaced rather than a fixed string: ✗ can mean "no onnxruntime" or "no
// model downloaded", the user fixes those in different places, and a single
// generic "not installed" would send half of them to the wrong one.

/** The installer action. STORED KEY — never rename without an alias path
 *  (backend `_CAPABILITY_PACKAGES`, `INSTALL_ACTIONS`, config `wd14.*`). */
export const WD14_ACTION = 'wd14';

/** What the user reads. Names the job, not the model architecture: nobody is
 *  looking for "SwinV2", they are looking for a way to sort a pile of images. */
export const WD14_LABEL = 'Image tagging (WD14)';

/** Announced BEFORE the click. Someone who accepts a 400 MB download knowingly
 *  does not feel trapped; someone who discovers it mid-flight does. The bulk is
 *  the model itself — the pip half is usually nothing, since onnxruntime is
 *  already there on any install that has face detection or background removal. */
export const WD14_COST = '~400 MB, a few minutes';

const READY_DETAIL = 'The tagger is installed — the bank\'s 🔖 Tags pass is available.';

/** Decide what to show where the tagger is USED (the bank's Tags button, the
 *  Setup tile), from the live capabilities.
 *
 *  @param capable      `caps.wd14` — true only when onnxruntime imports AND the
 *                      model files are on disk.
 *  @param detail       `caps.wd14_detail` — WHICH half is missing. Shown as-is
 *                      when present; a generic message would be a downgrade.
 *  @param capsLoading  capabilities still in flight -> stay quiet rather than
 *                      flashing "not installed" for a frame.
 *  @param python       `caps.python` = {version, ml_supported, ml_range}. ABSENT
 *                      or shapeless -> treated as supported: an unknown probe
 *                      must never hide the install button.
 *  @returns {status, canInstall, action, label, headline, detail}
 *           status: 'loading' | 'ready' | 'installable' | 'unsupported_python'
 */
export function wd14InstallState({ capable, detail, capsLoading, python } = {}) {
  const base = { action: WD14_ACTION, label: WD14_LABEL, canInstall: false };
  if (capsLoading) {
    return { ...base, status: 'loading', headline: '', detail: '' };
  }
  if (capable === true) {
    return { ...base, status: 'ready',
             headline: `${WD14_LABEL} is ready`, detail: READY_DETAIL };
  }
  // Python outside the ML wheel range (3.10–3.12) is the likeliest state of a
  // brand-new install on a current Python. Offering a button that can only end
  // in a source build and a 200-line pip traceback would be a lie.
  if (python && python.ml_supported === false) {
    const version = python.version || 'this Python';
    const range = python.ml_range || '3.10–3.12';
    return {
      ...base,
      status: 'unsupported_python',
      headline: `${WD14_LABEL} can't be installed on Python ${version}`,
      detail: `This app runs on Python ${version}, and the ML wheels it needs are `
        + `published only for Python ${range}, so installing here would try to build `
        + 'from source and fail. Install them into a separate '
        + `Python ${range} environment, then point wd14.python at that interpreter `
        + 'in Settings ▸ Local tools.',
    };
  }
  // The server's own reason when it has one — "model not downloaded" and
  // "onnxruntime import failed" are different problems with different fixes.
  const why = String(detail || '').trim();
  return {
    ...base,
    status: 'installable',
    canInstall: true,
    headline: `${WD14_LABEL} isn't installed`,
    detail: (why ? `${why}. ` : '')
      + `Optional download (${WD14_COST}). It labels what's in each picture — hair `
      + 'colour, clothing, setting — so a big bank can be sorted before you spend '
      + 'GPU time captioning it. Without it the app works exactly as it does now.',
  };
}
