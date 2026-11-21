/**
 * 🚩 Find watermarks — the dataset's launch window, brought up to the 🔤 Find
 * text window's standard on the maintainer's ask ("the same kind of menu for
 * the watermark pass — tuning and visualisation, dataset and bank alike"):
 * a sample dial, the stored detector threshold edited where its effect is
 * judged, and the flagged pages drawn with their zones IN the window, filling
 * live while the scan runs. Until now this button fired straight from the
 * click — the only pass left with no window at all.
 *
 * The scope story differs from the bank BY MECHANIC, not by behaviour: this
 * pass has always re-judged every KEPT image on every run (the bank's resumes
 * where it stopped), so instead of the bank's "re-check scanned" line this
 * window says that out loud. Dismissed rows keep their ruling on both
 * surfaces unless the re-examine line below is ticked.
 */
import { useEffect, useRef, useState } from 'react';
import { putJson } from '../../api/fetchClient';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import DatasetZonesPreview from './DatasetZonesPreview.jsx';
import WatermarkEngineChoice from '../shared/WatermarkEngineChoice.jsx';
import { watermarkEngineStatus } from '../../utils/watermarkEngine.js';
import { btnClass } from '../common/controls';

export default function WatermarkScanDialog({
  onClose, onLaunch, kept = 0, dismissed = 0, threshold = 0.94,
  live = false, datasetId, caps = {},
}) {
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [sampleOn, setSampleOn] = useState(false);
  const [sampleSize, setSampleSize] = useState(20);
  const [engine, setEngine] = useState(caps.watermark_detect_backend || 'auto');
  const [level, setLevel] = useState(
    Number.isFinite(Number(threshold)) ? Number(threshold) : 0.94);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  /* A run happened FROM THIS WINDOW — it stays open showing the flagged pages
     (the strip below); only the exit relabels. Same contract as 🔤. */
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

  const pool = kept + (includeDismissed ? dismissed : 0);
  const willRead = sampleOn
    ? Math.min(pool, Math.max(1, Math.round(Number(sampleSize) || 20)))
    : pool;

  const saveThreshold = async (value) => {
    try {
      await putJson('/api/settings', { config: { watermark_detect: { threshold: value } } });
    } catch { /* the run still uses the stored value */ }
  };

  const launch = async () => {
    if (busy || willRead === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onLaunch({
        ...(includeDismissed ? { includeDismissed: true } : {}),
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Find watermarks"
        className="w-full max-w-3xl xl:max-w-4xl space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl"
        style={{ maxHeight: 'min(38rem, calc(100vh - 2rem))' }}>
        <h2 className="m-0 text-base font-bold text-content">🚩 Find watermarks</h2>
        <p className="m-0 text-xs text-content-muted">Scans {kept} kept image{kept === 1 ? '' : 's'}</p>
        <label className="flex items-start gap-2 text-2xs text-content-subtle">
          <input type="checkbox" className="mt-0.5" checked={includeDismissed}
            onChange={(e) => setIncludeDismissed(e.target.checked)} disabled={live || busy} />
          <span className="font-medium text-content">Include Dismissed ({dismissed})</span>
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
          <WatermarkEngineChoice caps={caps} disabled={busy || live}
            onChanged={(engine) => setEngine(engine)} />
          {watermarkEngineStatus(engine, caps).runs === 'detector' ? (
            <label className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 text-xs" title="Lower values flag fainter marks and can add false flags. Shared by Bank and Dataset.">
              <span className="font-medium text-content">Detector Threshold</span>
              <span className="flex flex-wrap items-center gap-2">
                <input type="range" min="0.50" max="0.99" step="0.01" value={level}
                  disabled={live || busy} aria-label="Detector threshold"
                  onChange={(e) => setLevel(Number(e.target.value))}
                  onMouseUp={() => saveThreshold(level)}
                  onTouchEnd={() => saveThreshold(level)}
                  onKeyUp={() => saveThreshold(level)}
                  className="w-40" />
                <span className="tabular-nums text-content">{level.toFixed(2)}</span>
                <span className="text-content-subtle">(default 0.94)</span>
              </span>
            </label>
          ) : null}
        </div>
        {/* The run's RESULT, in the window that launched it: the 🚩-family
            flagged pages (text-flagged ones live in the 🔤 window) with their
            boxes, polled while the scan runs — same strip, same poll as 🔤. */}
        <DatasetZonesPreview datasetId={datasetId} kind="watermark" live={busy || live}
          emptyLine={ran ? 'No watermark found on the scanned images.' : null} />
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
            title={willRead === 0 ? 'Nothing to read in this scope.' : undefined}
            className={btnClass({ variant: 'primary' })}>
            {busy ? 'Scanning' : `Scan ${willRead} image${willRead === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
