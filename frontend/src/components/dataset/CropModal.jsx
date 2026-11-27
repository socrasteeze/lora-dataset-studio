/** Shared crop editor with confidence-gated Auto-Crop and a stretchable box.
 * Auto-Crop finds and saves a crop. Drag the 8 handles to resize, drag
 * inside to move — any shape, not just square (training buckets non-square
 * images fine). Ratio presets snap the box; `defaultAspect` presets the initial
 * ratio (the reference crop starts at 1:1 — its historical convention — but
 * stays freely reshapeable: nothing downstream actually requires a square).
 * `lockSquare` pins 1:1 and hides the ratio row (kept for callers that need it).
 * Returns the box in NATURAL image pixels, same contract as before.
 * Custom implementation (no react-easy-crop): that lib pins a fixed frame and
 * moves the image under it — it cannot stretch the selection itself. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { fetchWithCsrfRetry, postForm } from '../../api/fetchClient';
import { autoCenterCrop, cropPreviewBlob } from './autoCenterCrop.js';
import { clampBox, cropDisplayBox, dragCropBox, readCropSourceSize, roundCropBox } from './cropGeometry.js';
import AutoCropOptions, { DEFAULT_CROP_CONFIDENCE_PERCENT, validCropConfidence } from './AutoCropOptions.jsx';

const ASPECTS = [
  ['Free', null],
  ['1:1', 1],
  ['3:4', 3 / 4],
  ['2:3', 2 / 3],
  ['9:16', 9 / 16],
  ['4:3', 4 / 3],
  ['3:2', 3 / 2],
  ['16:9', 16 / 9],
];
// Handles: name -> which box edges the drag moves.
const HANDLES = [
  ['nw', { left: true, top: true }], ['n', { top: true }], ['ne', { right: true, top: true }],
  ['w', { left: true }], ['e', { right: true }],
  ['sw', { left: true, bottom: true }], ['s', { bottom: true }], ['se', { right: true, bottom: true }],
];
const HANDLE_POS = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
};

// Best centered box of `ratio` (w/h) fitting inside W x H, centered on the current box.
function ratioBox(cur, ratio, W, H) {
  let w = cur.w; let h = w / ratio;
  if (h > H) { h = H; w = h * ratio; }
  if (w > W) { w = W; h = w / ratio; }
  const cx = cur.x + cur.w / 2; const cy = cur.y + cur.h / 2;
  return clampBox({ x: cx - w / 2, y: cy - h / 2, w, h }, W, H);
}

export default function CropModal({ imageUrl, onCancel, onConfirm, onReset,
                                    lockSquare = false, defaultAspect = null, usePreview = false }) {
  const [preview, setPreview] = useState(null);
  const [frame, setFrame] = useState(null);
  const [box, setBox] = useState(null);        // crop box in NATURAL px
  const [aspect, setAspect] = useState(lockSquare ? 1 : defaultAspect);   // null = free
  const [framing, setFraming] = useState('subject');
  const [cropConfidence, setCropConfidence] = useState(DEFAULT_CROP_CONFIDENCE_PERCENT);
  const [autoBusy, setAutoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const framingId = useId();
  const imgRef = useRef(null);
  const viewportRef = useRef(null);
  const selectionRef = useRef(null);
  const sizeBadgeRef = useRef(null);
  const cancelRef = useRef(null);
  const dragRef = useRef(null);
  const requestRef = useRef(null);
  const requestVersion = useRef(0);
  const detection = useRef(null);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const busy = autoBusy || saving;
  const activePreview = usePreview && preview?.imageUrl === imageUrl ? preview : null;
  const shownUrl = usePreview ? activePreview?.url : imageUrl;
  const nat = frame?.url === shownUrl ? frame?.size : null;

  useEffect(() => {
    if (!usePreview) return;
    const controller = new AbortController();
    let objectUrl;
    async function loadPreview() {
      try {
        const url = new URL(imageUrl, window.location.origin);
        url.searchParams.set('crop_preview', '1');
        const response = await fetchWithCsrfRetry(url, { signal: controller.signal });
        const size = readCropSourceSize(response.headers.get('X-Crop-Source-Size'));
        // A downscaled response is usable only with an exact source size.
        if (!response.ok || !size) {
          response.body?.cancel().catch(() => {});
          if (!controller.signal.aborted) setPreview({ imageUrl, url: imageUrl, size: null });
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ imageUrl, url: objectUrl, size });
      } catch {
        if (!controller.signal.aborted) setPreview({ imageUrl, url: imageUrl, size: null });
      }
    }
    loadPreview();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl, usePreview]);

  useEffect(() => {
    mounted.current = true;
    detection.current = null;
    setAutoBusy(false); setError(''); setSetupRequired(false);
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [imageUrl]);

  const paintBox = useCallback((selection, sourceSize) => {
    if (!selectionRef.current || !sizeBadgeRef.current) return;
    const { left, top, width, height } = cropDisplayBox(selection, sourceSize);
    Object.assign(selectionRef.current.style, {
      left: `${left * 100}%`, top: `${top * 100}%`, width: `${width * 100}%`, height: `${height * 100}%`,
    });
    const size = `${Math.round(selection.w)}×${Math.round(selection.h)}`;
    if (sizeBadgeRef.current.textContent !== size) sizeBadgeRef.current.textContent = size;
  }, []);

  useLayoutEffect(() => {
    if (box && nat) paintBox(box, nat);
  }, [box, nat, paintBox]);

  const clearDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.frame != null) cancelAnimationFrame(drag.frame);
    return drag?.latest;
  }, []);
  useLayoutEffect(() => () => { clearDrag(); }, [shownUrl, clearDrag]);

  const finishDrag = () => {
    const selection = clearDrag();
    if (selection) {
      paintBox(selection, nat);
      setBox(selection);
    }
    return selection;
  };

  const autoCenter = async () => {
    if (!nat || requestRef.current || savingRef.current || !validCropConfidence(cropConfidence)) return;
    const minimum = Number(cropConfidence) / 100;
    const controller = new AbortController();
    requestRef.current = controller;
    const version = ++requestVersion.current;
    setAutoBusy(true); setError(''); setSetupRequired(false);
    finishDrag();
    try {
      let found = detection.current;
      if (!found || found.imageUrl !== imageUrl || found.framing !== framing) {
        const blob = await cropPreviewBlob(imgRef.current);
        if (controller.signal.aborted) return;
        const form = new FormData();
        form.append('file', blob, 'preview.jpg');
        form.append('framing', framing);
        form.append('min_crop_confidence', String(minimum));
        const result = await postForm('/api/image/auto-center', form, { signal: controller.signal });
        found = { imageUrl, framing, bounds: result.box, confidence: result.confidence };
      }
      if (!mounted.current || version !== requestVersion.current) return;
      detection.current = found;
      if (!Number.isFinite(found.confidence) || found.confidence < minimum) {
        throw new Error('Confidence is below the minimum. Adjust the crop manually or lower the minimum.');
      }
      const suggestion = autoCenterCrop(found.bounds, nat.W, nat.H, lockSquare ? 1 : aspect);
      setBox(suggestion.box);
      requestRef.current = null;
      setAutoBusy(false);
      await save(() => onConfirm(roundCropBox(suggestion.box)));
    } catch (failure) {
      if (mounted.current && version === requestVersion.current && failure.name !== 'AbortError') {
        setError(failure.body?.detail || failure.message || 'Auto-Crop failed. Adjust the crop manually.');
        setSetupRequired(Boolean(failure.body?.setup_required));
      }
    } finally {
      if (version === requestVersion.current) {
        requestRef.current = null;
        if (mounted.current) setAutoBusy(false);
      }
    }
  };

  const save = async (action) => {
    if (savingRef.current || requestRef.current) return;
    savingRef.current = true;
    setSaving(true); setError(''); setSetupRequired(false);
    const selection = finishDrag() ?? box;
    try {
      if (await action(selection) === false) throw new Error('The crop was not saved. Your selection is still here.');
    } catch (failure) {
      if (mounted.current) setError(failure.message || 'The crop was not saved. Your selection is still here.');
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const cancel = useCallback(() => {
    if (savingRef.current) return;
    requestRef.current?.abort();
    onCancel();
  }, [onCancel]);

  const onImgLoad = (e) => {
    const { W, H } = activePreview?.size ?? { W: e.target.naturalWidth, H: e.target.naturalHeight };
    setFrame({ url: shownUrl, size: { W, H } });
    // Initial box: largest centered box of the initial ratio, or 80% of the frame.
    const a = lockSquare ? 1 : defaultAspect;
    if (a) {
      let w = W; let h = w / a;
      if (h > H) { h = H; w = h * a; }
      setBox({ x: (W - w) / 2, y: (H - h) / 2, w, h });
    } else {
      setBox(clampBox({ x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.8 }, W, H));
    }
  };

  // Escape closes; initial focus on Cancel.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  // Keep the image and its handles fitted when status text or controls wrap.
  useEffect(() => {
    const onResize = () => {
      const el = viewportRef.current;
      if (!el) return;
      setViewport((old) => old.width === el.clientWidth && old.height === el.clientHeight
        ? old : { width: el.clientWidth, height: el.clientHeight });
    };
    onResize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    window.addEventListener('resize', onResize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', onResize); };
  }, []);

  const startDrag = (e, mode) => {
    if (busy || dragRef.current || e.button !== 0) return;
    const { width, height } = imgRef.current.getBoundingClientRect();
    if (!width || !height) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId, edges: Object.fromEntries(HANDLES)[mode],
      sx: e.clientX, sy: e.clientY, start: box, latest: box, width, height, frame: null,
    };
  };

  const onMove = (e) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== e.pointerId) return;
    drag.latest = dragCropBox(drag, e.clientX, e.clientY, nat, lockSquare ? 1 : aspect);
    if (drag.frame == null) {
      drag.frame = requestAnimationFrame(() => {
        drag.frame = null;
        paintBox(drag.latest, nat);
      });
    }
  };

  const endDrag = (e) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== e.pointerId) return;
    if (e.type === 'pointerup' && (e.clientX !== drag.sx || e.clientY !== drag.sy || drag.latest !== drag.start)) {
      drag.latest = dragCropBox(drag, e.clientX, e.clientY, nat, lockSquare ? 1 : aspect);
    }
    finishDrag();
  };

  const pickAspect = (value) => {
    if (busy) return;
    setError(''); setSetupRequired(false);
    setAspect(value);
    const selection = finishDrag() ?? box;
    if (value && selection && nat) setBox(ratioBox(selection, value, nat.W, nat.H));
  };

  const fit = nat && viewport.width && viewport.height
    ? Math.min(1, viewport.width / nat.W, viewport.height / nat.H) : null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Crop image"
      data-probe-chrome="crop-editor" data-probe-layer
      className="fixed inset-0 z-[9995] bg-black/85 flex flex-col p-3 sm:p-4">
      <div ref={viewportRef} className="relative flex-1 min-h-0 w-full max-w-4xl mx-auto flex items-center justify-center overflow-hidden">
        <div className="relative inline-block max-h-full max-w-full"
          onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
          style={fit == null ? undefined : { width: nat.W * fit, height: nat.H * fit }}>
          {shownUrl && <img key={shownUrl} ref={imgRef} src={shownUrl} alt="to crop" onLoad={onImgLoad}
            decoding="async" draggable={false}
            onError={() => {
              setFrame(null); setBox(null);
              if (activePreview && shownUrl !== imageUrl) setPreview({ imageUrl, url: imageUrl, size: null });
              else setError('The image could not load. Close the editor and try again.');
            }}
            className="max-h-full max-w-full object-fill select-none block"
            style={fit == null ? undefined : { width: '100%', height: '100%' }} />}
          {box && nat && (
            <div
              ref={selectionRef}
              className="absolute border-2 border-indigo-400 cursor-move touch-none"
              style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
              onPointerDown={(e) => startDrag(e, 'move')}
              role="application" aria-label="Crop selection · drag to move, use the handles to stretch">
              {HANDLES.map(([name]) => (
                <span key={name}
                  onPointerDown={(e) => startDrag(e, name)}
                  className={`absolute w-11 h-11 touch-none after:pointer-events-none after:absolute after:left-1/2 after:top-1/2 after:h-3.5 after:w-3.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:border-white/90 after:bg-indigo-400 ${HANDLE_POS[name]}`} />
              ))}
              <span ref={sizeBadgeRef} className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-black/70 text-white text-2xs tabular-nums pointer-events-none" />
            </div>
          )}
        </div>
      </div>
      <div className="max-h-[55dvh] shrink-0 w-full max-w-4xl mx-auto mt-3 flex flex-col gap-2 overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor={framingId} className="sr-only">Auto-Crop Framing</label>
          <select id={framingId} value={framing} disabled={busy}
            onChange={(event) => { setFraming(event.target.value); setError(''); }}
            className="min-h-11 min-w-0 rounded-lg border border-white/25 bg-surface px-2 text-base text-content lg:text-sm">
            <option value="subject">Full Subject</option>
            <option value="head">Face &amp; Head</option>
          </select>
          <button type="button" onClick={autoCenter} disabled={!nat || busy || !validCropConfidence(cropConfidence)} aria-busy={autoBusy}
            title="Find and save a crop"
            className="min-h-11 min-w-0 whitespace-nowrap rounded-lg bg-white/10 px-2 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {autoBusy ? 'Detecting' : 'Auto-Crop'}
          </button>
        </div>
        <AutoCropOptions enabled confidence={cropConfidence} onConfidenceChange={setCropConfidence}
          disabled={busy} note="Auto-Crop saves immediately if confidence meets the minimum." />
        {error && <p role="alert" className="break-words text-sm text-rose-200">{error}</p>}
        {setupRequired && <a href="/#/setup" target="_blank" rel="noopener noreferrer"
          className="flex min-h-10 items-center text-sm text-white underline">Open Setup</a>}
        {!lockSquare && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1" role="group" aria-label="Crop aspect ratio">
            <span className="text-white/60 text-xs">Ratio</span>
            {ASPECTS.map(([label, value]) => (
              <button key={label} type="button" onClick={() => pickAspect(value)} disabled={busy}
                aria-pressed={aspect === value}
                className={`min-h-11 w-12 min-w-12 shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-xs font-semibold ${aspect === value
                  ? 'bg-indigo-500 text-gray-950'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto grid w-full max-w-sm grid-flow-col auto-cols-fr gap-2">
          {onReset && (
            <button type="button" onClick={() => save(() => onReset())} disabled={busy}
              title="Reset to the automatic crop"
              className="min-h-11 min-w-0 whitespace-nowrap px-2 py-2 rounded-lg bg-surface text-content text-sm disabled:opacity-40">
              ↺ Reset
            </button>
          )}
          <button type="button" ref={cancelRef} onClick={cancel} disabled={saving}
            className="min-h-11 min-w-0 whitespace-nowrap px-2 py-2 rounded-lg bg-surface text-content text-sm disabled:opacity-40">Cancel</button>
          <button type="button" disabled={!box || !nat || busy} aria-busy={saving}
            onClick={() => save((selection) => onConfirm(roundCropBox(selection)))}
            className="min-h-11 min-w-0 whitespace-nowrap px-2 py-2 rounded-lg bg-gradient-primary text-gray-950 text-sm font-semibold disabled:opacity-40">
            {saving ? 'Saving' : 'Crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
