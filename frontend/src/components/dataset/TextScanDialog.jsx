/**
 * 🔤 Find text — the dataset's launch window. FULL PARITY with the bank's
 * dialog is the point (maintainer's rule: shared features ship at full parity
 * on both surfaces): the same two dials — "try on a sample first" and the
 * stored Sensitivity — priced with the same measured counts, before anything
 * runs. The pass itself is the same engine, the same merge rules, the same
 * funnel; this window only decides how much of it runs and at what floor.
 *
 * The scope story differs from the bank BY MECHANIC, not by behaviour: a
 * dataset pass has always read the KEPT images (its watermark scan does the
 * same), so instead of the bank's pile picker this window says that out
 * loud, with the number it means.
 */
import { useEffect, useRef, useState } from 'react';
import { putJson } from '../../api/fetchClient';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import DatasetZonesPreview from './DatasetZonesPreview.jsx';
import { btnClass } from '../common/controls';

export default function TextScanDialog({
  onClose, onLaunch, toRead = 0, rereadable = 0, sensitivity = 0.5, live = false,
  datasetId,
}) {
  const [redo, setRedo] = useState(false);
  const [sampleOn, setSampleOn] = useState(false);
  const [sampleSize, setSampleSize] = useState(20);
  const [level, setLevel] = useState(
    Number.isFinite(Number(sensitivity)) ? Number(sensitivity) : 0.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  /* A run happened FROM THIS WINDOW. The window then stays open showing the
     flagged pages with their zones (the strip below) — closing on launch would
     hide exactly what a sample run was started to show. Only relabels the exit
     and arms the strip's "nothing found" line; every dial keeps working, so
     adjust-and-rerun needs no reopen. Bank parity: its window does the same. */
  const [ran, setRan] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  const pool = redo ? rereadable : toRead;
  const willRead = sampleOn
    ? Math.min(pool, Math.max(1, Math.round(Number(sampleSize) || 20)))
    : pool;

  const saveSensitivity = async (value) => {
    try {
      await putJson('/api/settings', { config: { text_scan: { score_min: value } } });
    } catch { /* the run still uses the stored value */ }
  };

  const launch = async () => {
    if (busy || willRead === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onLaunch({
        rescan: redo,
        ...(sampleOn
          ? { limit: Math.max(1, Math.min(10000, Math.round(Number(sampleSize) || 20))) }
          : {}),
      });
      setRan(true);
    } catch (e) {
      /* A thrown launch (the vision model missing, the server down) used to
         vanish into an unhandled rejection — the window sat there silent.
         Rendered HERE, over the dials that produced it, choices kept. */
      setError(e?.message || 'The scan could not start.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9991] flex items-center justify-center bg-black/80 p-3 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Find text"
        className="w-full max-w-lg lg:max-w-3xl xl:max-w-4xl space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl"
        style={{ maxHeight: 'min(38rem, calc(100vh - 2rem))' }}>
        <h2 className="m-0 text-base font-bold text-content">🔤 Find text</h2>
        <p className="m-0 text-xs text-content-muted">{toRead} kept image{toRead === 1 ? '' : 's'} to scan</p>
        <label className="flex items-start gap-2 text-2xs text-content-subtle">
          <input type="checkbox" className="mt-0.5" checked={redo}
            onChange={(e) => setRedo(e.target.checked)} disabled={live || busy} />
          <span className="font-medium text-content">Rescan Images ({rereadable})</span>
        </label>
        <div className="lds-section space-y-2 py-2">
          <p className="m-0 text-2xs font-semibold uppercase tracking-wide text-content-muted">
            This Run
          </p>
          <div className="flex min-h-10 flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex min-h-10 items-center gap-2 lg:min-h-7" title="Scan only the first images in scope.">
              <input type="checkbox" checked={sampleOn}
                onChange={(e) => setSampleOn(e.target.checked)} disabled={live || busy} />
              Sample Run
            </label>
            <input type="number" min="1" max="10000" value={sampleSize}
              onChange={(e) => setSampleSize(e.target.value)}
              disabled={live || busy || !sampleOn} aria-label="Sample size"
              title="Number of images in the sample" className="h-10 w-20 rounded border border-border bg-app px-2 text-content lg:h-7" />
          </div>
          <label className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 text-xs" title="Lower values detect fainter lettering and can add false zones. Shared by Bank and Dataset.">
            <span className="font-medium text-content">Sensitivity</span>
            <span className="flex flex-wrap items-center gap-2">
              <input type="range" min="0.30" max="0.70" step="0.05" value={level}
                disabled={live || busy} aria-label="Text sensitivity"
                onChange={(e) => setLevel(Number(e.target.value))}
                onMouseUp={() => saveSensitivity(level)}
                onTouchEnd={() => saveSensitivity(level)}
                onKeyUp={() => saveSensitivity(level)}
                className="w-40" />
              <span className="tabular-nums text-content">{level.toFixed(2)}</span>
              <span className="text-content-subtle">(default 0.50)</span>
            </span>
          </label>
        </div>
        {/* The run's RESULT, in the window that launched it: the flagged pages
            with their zones, POLLED while the scan runs so they fill in as
            text is found (the pass commits per image). It used to read the
            workspace payload instead, which only refreshes when the run
            returns — a whole 106-page scan with the strip sitting on
            "nothing flagged yet" the entire time. Bank parity: same strip,
            same poll, off this surface's own /text/preview. */}
        <DatasetZonesPreview datasetId={datasetId} live={busy || live}
          emptyLine={ran ? 'No text found on the scanned images.' : null} />
        {error && (
          <div role="alert"
            className="max-h-24 overflow-y-auto rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
            <span className="block whitespace-pre-wrap break-words text-xs leading-relaxed text-red-200">
              {error}
            </span>
            <span className="mt-1 block text-2xs text-content-subtle">
              Your choices are kept. Adjust and retry.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy}
            className={btnClass()}>
            {ran ? 'Close' : 'Cancel'}
          </button>
          <button type="button" onClick={launch}
            disabled={busy || live || willRead === 0}
            title={willRead === 0 ? 'Nothing left to read in this scope.' : undefined}
            className={btnClass({ variant: 'primary' })}>
            {busy ? 'Scanning' : `Scan ${willRead} image${willRead === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
