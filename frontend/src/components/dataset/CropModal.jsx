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
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { postForm } from '../../api/fetchClient';
import { autoCenterCrop, cropPreviewBlob } from './autoCenterCrop.js';
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
const MIN_SIDE = 32;   // natural px — below this a crop is useless for training

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

function clampBox(b, W, H) {
  const w = Math.min(Math.max(b.w, MIN_SIDE), W);
  const h = Math.min(Math.max(b.h, MIN_SIDE), H);
  return { x: Math.min(Math.max(b.x, 0), W - w), y: Math.min(Math.max(b.y, 0), H - h), w, h };
}

// Best centered box of `ratio` (w/h) fitting inside W x H, centered on the current box.
function ratioBox(cur, ratio, W, H) {
  let w = cur.w; let h = w / ratio;
  if (h > H) { h = H; w = h * ratio; }
  if (w > W) { w = W; h = w / ratio; }
  const cx = cur.x + cur.w / 2; const cy = cur.y + cur.h / 2;
  return clampBox({ x: cx - w / 2, y: cy - h / 2, w, h }, W, H);
}

export default function CropModal({ imageUrl, onCancel, onConfirm, onReset,
                                    lockSquare = false, defaultAspect = null }) {
  const [nat, setNat] = useState(null);        // {W, H} natural size
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
  const cancelRef = useRef(null);
  const dragRef = useRef(null);                // {mode, start, startBox}
  const requestRef = useRef(null);
  const requestVersion = useRef(0);
  const detection = useRef(null);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const busy = autoBusy || saving;

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

  const autoCenter = async () => {
    if (!nat || requestRef.current || savingRef.current || !validCropConfidence(cropConfidence)) return;
    const minimum = Number(cropConfidence) / 100;
    const controller = new AbortController();
    requestRef.current = controller;
    const version = ++requestVersion.current;
    setAutoBusy(true); setError(''); setSetupRequired(false);
    dragRef.current = null;
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
      await save(() => onConfirm({ x: Math.round(suggestion.box.x), y: Math.round(suggestion.box.y),
        w: Math.round(suggestion.box.w), h: Math.round(suggestion.box.h) }));
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
    dragRef.current = null;
    try {
      if (await action() === false) throw new Error('The crop was not saved. Your selection is still here.');
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
    const W = e.target.naturalWidth; const H = e.target.naturalHeight;
    setNat({ W, H });
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

  const scale = () => {
    const el = imgRef.current;
    return el && nat ? el.getBoundingClientRect().width / nat.W : 1;
  };

  const startDrag = (e, mode) => {
    if (busy) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...box } };
  };

  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || !nat) return;
    const s = scale();
    const dx = (e.clientX - d.sx) / s;
    const dy = (e.clientY - d.sy) / s;
    const { W, H } = nat;
    const b0 = d.start;
    if (d.mode === 'move') {
      setBox(clampBox({ ...b0, x: b0.x + dx, y: b0.y + dy }, W, H));
      return;
    }
    const edges = Object.fromEntries(HANDLES)[d.mode] || {};
    let x1 = b0.x, y1 = b0.y, x2 = b0.x + b0.w, y2 = b0.y + b0.h;
    if (edges.left) x1 = Math.min(Math.max(0, x1 + dx), x2 - MIN_SIDE);
    if (edges.right) x2 = Math.max(Math.min(W, x2 + dx), x1 + MIN_SIDE);
    if (edges.top) y1 = Math.min(Math.max(0, y1 + dy), y2 - MIN_SIDE);
    if (edges.bottom) y2 = Math.max(Math.min(H, y2 + dy), y1 + MIN_SIDE);
    let nb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    const ratio = lockSquare ? 1 : aspect;
    const horiz = !!(edges.left || edges.right);
    const vert = !!(edges.top || edges.bottom);
    if (ratio && horiz !== vert) {
      // An edge's middle handle: the other side follows the ratio about the
      // box's CENTRE, not from its top/left edge (which made the box spread to
      // the right or downward). Capped by the frame; clampBox slides it inside.
      if (horiz) {
        nb.h = Math.min(nb.w / ratio, H); nb.w = nb.h * ratio;
        if (edges.left) nb.x = x2 - nb.w;
        nb.y = b0.y + b0.h / 2 - nb.h / 2;
      } else {
        nb.w = Math.min(nb.h * ratio, W); nb.h = nb.w / ratio;
        if (edges.top) nb.y = y2 - nb.h;
        nb.x = b0.x + b0.w / 2 - nb.w / 2;
      }
    } else if (ratio) {
      // A corner: the dominant dragged dimension wins, the other follows;
      // anchor on the opposite corner so the grab point tracks.
      if (Math.abs(dx) >= Math.abs(dy)) nb.h = nb.w / ratio;
      else nb.w = nb.h * ratio;
      if (edges.left) nb.x = x2 - nb.w;
      if (edges.top) nb.y = y2 - nb.h;
      // keep inside the frame — shrink if the ratio pushed it out
      if (nb.x < 0) { nb.w += nb.x; nb.h = nb.w / ratio; nb.x = 0; if (edges.top) nb.y = y2 - nb.h; }
      if (nb.y < 0) { nb.h += nb.y; nb.w = nb.h * ratio; nb.y = 0; if (edges.left) nb.x = x2 - nb.w; }
      if (nb.x + nb.w > W) { nb.w = W - nb.x; nb.h = nb.w / ratio; if (edges.top) nb.y = y2 - nb.h; }
      if (nb.y + nb.h > H) { nb.h = H - nb.y; nb.w = nb.h * ratio; if (edges.left) nb.x = x2 - nb.w; }
    }
    setBox(clampBox(nb, W, H));
    // scale() reads live refs: listing it would recreate the handler every render for the same
    // value read during the drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat, aspect, lockSquare]);

  const endDrag = useCallback(() => { dragRef.current = null; }, []);
  useEffect(() => {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', endDrag); };
  }, [onMove, endDrag]);

  const pickAspect = (value) => {
    if (busy) return;
    setError(''); setSetupRequired(false);
    setAspect(value);
    if (value && box && nat) setBox(ratioBox(box, value, nat.W, nat.H));
  };

  const fit = nat && viewport.width && viewport.height
    ? Math.min(1, viewport.width / nat.W, viewport.height / nat.H) : null;
  const s = fit ?? scale();
  return (
    <div role="dialog" aria-modal="true" aria-label="Crop image"
      data-probe-chrome="crop-editor" data-probe-layer
      className="fixed inset-0 z-[9995] bg-black/85 flex flex-col p-3 sm:p-4">
      <div ref={viewportRef} className="relative flex-1 min-h-0 w-full max-w-4xl mx-auto flex items-center justify-center overflow-hidden">
        <div className="relative inline-block max-h-full max-w-full"
          style={fit == null ? undefined : { width: nat.W * fit, height: nat.H * fit }}>
          <img ref={imgRef} src={imageUrl} alt="to crop" onLoad={onImgLoad} draggable={false}
            onError={() => { setNat(null); setBox(null); setError('The image could not load. Close the editor and try again.'); }}
            className="max-h-full max-w-full object-contain select-none block"
            style={fit == null ? undefined : { width: '100%', height: '100%' }} />
          {box && nat && (
            <div
              className="absolute border-2 border-indigo-400 cursor-move touch-none"
              style={{ left: box.x * s, top: box.y * s, width: box.w * s, height: box.h * s,
                       boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
              onPointerDown={(e) => startDrag(e, 'move')}
              role="application" aria-label="Crop selection — drag to move, use the handles to stretch">
              {HANDLES.map(([name]) => (
                <span key={name}
                  onPointerDown={(e) => startDrag(e, name)}
                  className={`absolute w-11 h-11 touch-none after:pointer-events-none after:absolute after:left-1/2 after:top-1/2 after:h-3.5 after:w-3.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:border-white/90 after:bg-indigo-400 ${HANDLE_POS[name]}`} />
              ))}
              <span className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-black/70 text-white text-2xs tabular-nums pointer-events-none">
                {Math.round(box.w)}×{Math.round(box.h)}
              </span>
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
            title="Find and save a crop with your configured local vision model."
            className="min-h-11 min-w-0 rounded-lg bg-white/10 px-2 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {autoBusy ? 'Finding Subject...' : 'Auto-Crop'}
          </button>
        </div>
        <AutoCropOptions enabled confidence={cropConfidence} onConfidenceChange={setCropConfidence}
          disabled={busy} note="Auto-Crop saves immediately when confidence meets this minimum." />
        {error && <p role="alert" className="break-words text-sm text-rose-200">{error}</p>}
        {setupRequired && <a href="/#/setup" target="_blank" rel="noopener noreferrer"
          className="flex min-h-10 items-center text-sm text-white underline">Open Setup</a>}
        {!lockSquare && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1" role="group" aria-label="Crop aspect ratio">
            <span className="text-white/60 text-xs">Ratio</span>
            {ASPECTS.map(([label, value]) => (
              <button key={label} type="button" onClick={() => pickAspect(value)} disabled={busy}
                aria-pressed={aspect === value}
                className={`min-h-11 w-12 min-w-12 shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${aspect === value
                  ? 'bg-indigo-500 text-gray-950'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto grid w-full max-w-sm grid-flow-col auto-cols-fr gap-2">
          {onReset && (
            <button type="button" onClick={() => save(onReset)} disabled={busy}
              title="Re-run the automatic head-crop on the original image"
              className="min-h-11 min-w-0 px-2 py-2 rounded-lg bg-surface text-content-muted text-sm">
              ↺ Reset to auto
            </button>
          )}
          <button type="button" ref={cancelRef} onClick={cancel} disabled={saving}
            className="min-h-11 min-w-0 px-2 py-2 rounded-lg bg-surface text-content text-sm">Cancel</button>
          <button type="button" disabled={!box || busy} aria-busy={saving}
            onClick={() => save(() => onConfirm({ x: Math.round(box.x), y: Math.round(box.y),
                                                 w: Math.round(box.w), h: Math.round(box.h) }))}
            className="min-h-11 min-w-0 px-2 py-2 rounded-lg bg-gradient-primary text-gray-950 text-sm font-semibold disabled:opacity-40">
            {saving ? 'Saving...' : 'Crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
