import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, postJson } from '../../api/fetchClient';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button, IconButton } from '../common/Controls.jsx';
import { ownsTypedKeys, reviewKeyAction } from '../shared/reviewShortcuts.js';
import BankReviewLightbox from './BankReviewLightbox.jsx';
import { imageVersionQuery } from './bankEdits.js';
import { comparisonPage, COMPARISON_PAGE_SIZE, duplicateComparisonPaths, toggleComparisonSelection } from './groupComparison.js';

export default function BankGroupComparison({ bankId, group, live = false, suspended = false, onClose, onChanged, onSaveCollection }) {
  const { ids, title, kind, groupId, collectionId } = group;
  const [offset, setOffset] = useState(0);
  const [meta, setMeta] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [missing, setMissing] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [retry, setRetry] = useState(0);
  const [detailId, setDetailId] = useState(null);
  const writeRef = useRef(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, detailId == null && !suspended);
  const pageIds = comparisonPage(ids, offset);
  const duplicatePaths = duplicateComparisonPaths(kind);

  useEffect(() => {
    let active = true;
    const current = comparisonPage(ids, offset);
    if (!current.length) { setLoading(false); return; }
    setLoading(true);
    const query = new URLSearchParams({ ids: current.join(','), limit: String(COMPARISON_PAGE_SIZE) });
    if (collectionId != null) query.set('collection_id', String(collectionId));
    apiFetch(`/api/bank/${bankId}/images?${query}`)
      .then((data) => {
        if (!active) return;
        const byId = Object.fromEntries((data.images || []).map((image) => [image.id, image]));
        setMeta((old) => ({ ...old, ...Object.fromEntries(current.map((id) => [id, byId[id] || null])) }));
      })
      .catch((failure) => { if (active) setError(failure.message || 'Could not load this page.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bankId, collectionId, ids, offset, retry]);

  const close = useCallback(() => { if (!writeRef.current) onClose(); }, [onClose]);
  const move = useCallback((direction) => {
    if (writeRef.current || loading) return;
    setOffset((old) => Math.max(0, Math.min(Math.max(0, Math.ceil(ids.length / COMPARISON_PAGE_SIZE) - 1)
      * COMPARISON_PAGE_SIZE, old + direction * COMPARISON_PAGE_SIZE)));
  }, [ids.length, loading]);

  const save = useCallback(async (status, operation = 'status') => {
    if (writeRef.current || live || (operation !== 'distinct' && !selected.size)) return;
    writeRef.current = true;
    setBusy(true); setError(null); setNotice(null);
    const wanted = [...selected];
    try {
      if (operation === 'resolve' || operation === 'distinct') {
        const path = operation === 'resolve' ? duplicatePaths?.resolve : duplicatePaths?.distinct;
        if (!path) throw new Error('This group is not a duplicate group.');
        await postJson(`/api/bank/${bankId}/${path}`, {
          group: groupId, expected_ids: ids, ...(operation === 'resolve' ? { keep_ids: wanted } : {}),
        });
        setNotice(operation === 'resolve' ? 'Selected copies kept. Other copies rejected.' : 'Group marked distinct. No images rejected.');
      } else {
        const result = await postJson(`/api/bank/${bankId}/images/status`, {
          ids: wanted, status, ...(collectionId != null ? { collection_id: collectionId } : {}),
        });
        if (result?.ok === false || result?.changed !== wanted.length) {
          throw new Error('Some selected images were not saved. Reload the page and check the selection.');
        }
        setMeta((old) => Object.fromEntries(Object.entries(old).map(([id, image]) =>
          [id, image && selected.has(Number(id)) ? { ...image, status } : image])));
        setNotice(`${wanted.length} image${wanted.length === 1 ? '' : 's'} saved. Unselected images unchanged.`);
      }
      setRetry((old) => old + 1);
      onChanged?.();
    } catch (failure) {
      setError(failure.message || 'Could not save. The selection is retained.');
    } finally {
      writeRef.current = false; setBusy(false);
    }
  }, [bankId, collectionId, duplicatePaths, groupId, ids, live, onChanged, selected]);

  useEffect(() => {
    const key = (event) => {
      if (detailId != null || suspended) return;
      const action = reviewKeyAction(event);
      if (action === 'close') { event.preventDefault(); close(); return; }
      if (action === 'keep' || action === 'reject') { event.preventDefault(); save(action); return; }
      if (action === 'back' || action === 'skip') { event.preventDefault(); move(action === 'back' ? -1 : 1); return; }
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
          && !ownsTypedKeys(event.target) && event.key?.toLowerCase() === 'u') {
        event.preventDefault(); save('pending');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close, detailId, move, save, suspended]);

  const unavailable = pageIds.filter((id) => meta[id] === null || missing.has(id)).length;
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Compare Bank Images"
      data-probe-chrome="group-comparison" data-probe-layer
      className="fixed inset-0 z-[65] flex min-h-0 flex-col bg-surface-overlay">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="min-w-0 grow truncate text-base font-semibold text-content" title={title}>{title || 'Compare Group'}</h2>
        <span className="text-xs tabular-nums text-content-muted">{ids.length} candidates</span>
        <Button onClick={() => onSaveCollection(selected.size ? [...selected] : ids)} disabled={busy || !ids.length}>
          Save Collection
        </Button>
        <IconButton label="Close comparison" onClick={close} disabled={busy}>✕</IconButton>
      </header>
      <div className="shrink-0 px-3 py-2 text-xs text-content-muted">
        <p>Each image fits its frame. Different framings are not aligned. Open an image for full-size detail.</p>
        <p>{duplicatePaths ? 'Resolve Copies rejects the other copies. Mark Distinct changes no image decisions.'
          : 'Keep several useful examples. Similarity alone does not reject images.'}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {ids.length === 0 && <p className="text-content-muted">This group has no members.</p>}
        {loading && <p role="status" className="text-sm text-content-muted">Loading candidates</p>}
        {unavailable > 0 && <p role="status" className="mb-2 text-sm text-amber-300">{unavailable} source images on this page are unavailable. Membership is retained.</p>}
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {pageIds.map((id) => {
            const image = meta[id];
            const absent = image === null || missing.has(id);
            return <article key={id} className={`min-w-0 overflow-hidden rounded-lg border ${selected.has(id) ? 'border-emerald-400' : 'border-border'}`}>
              <button type="button" onClick={() => setDetailId(id)} disabled={busy || !image || absent}
                aria-label={`Open full-size detail for image ${id}`}
                className="flex aspect-[4/3] w-full items-center justify-center bg-black/50 disabled:cursor-not-allowed">
                {image && !absent ? <img loading="lazy" src={`/api/bank/${bankId}/thumb/${id}${imageVersionQuery(image)}`}
                  alt={image.name || `Image ${id}`} className="h-full w-full object-contain"
                  onError={() => setMissing((old) => new Set(old).add(id))} />
                  : <span className="text-sm text-content-muted">{absent ? 'Missing Source' : 'Loading'}</span>}
              </button>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 px-2 py-1 text-xs text-content">
                <input type="checkbox" checked={selected.has(id)} disabled={busy || !image}
                  onChange={() => setSelected((old) => toggleComparisonSelection(old, id))} />
                <span className="min-w-0 grow truncate" title={image?.name || `Image ${id}`}>{image?.name || `Image ${id}`}</span>
                <span>{image?.status === 'keep' ? 'Kept' : image?.status === 'reject' ? 'Rejected' : 'Undecided'}</span>
              </label>
              {image && <p className="px-2 pb-2 text-2xs text-content-muted">{image.width || '?'} × {image.height || '?'}</p>}
            </article>;
          })}
        </div>
      </div>
      <footer className="shrink-0 space-y-2 border-t border-border bg-surface-overlay px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="min-h-5 text-xs">
          {error ? <p role="alert" className="text-rose-300">{error}</p>
            : <p role="status" className="text-content-muted">{busy ? 'Saving' : notice || `${selected.size} selected`}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button disabled={busy || live || !selected.size} onClick={() => save('reject')}>✕ Reject</Button>
          <Button disabled={busy || live || !selected.size} onClick={() => save('pending')}>Undecide</Button>
          <Button disabled={busy || live || !selected.size} onClick={() => save('keep')}>✓ Keep</Button>
        </div>
        {duplicatePaths && <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy || live || !selected.size} onClick={() => save('keep', 'resolve')}>Resolve Copies</Button>
          <Button disabled={busy || live} onClick={() => save(null, 'distinct')}>Mark Distinct</Button>
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || loading} onClick={() => setSelected((old) => new Set([...old, ...pageIds.filter((id) => meta[id])]))}>Select Page</Button>
          <Button disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>Clear Selection</Button>
          <Button disabled={busy || loading || offset === 0} onClick={() => move(-1)}>Previous</Button>
          <Button disabled={busy || loading || offset + COMPARISON_PAGE_SIZE >= ids.length} onClick={() => move(1)}>Next</Button>
          <Button disabled={busy} onClick={() => { setError(null); setMissing(new Set()); setRetry((old) => old + 1); }}>Reload</Button>
          <span className="text-xs tabular-nums text-content-muted">{ids.length ? offset + 1 : 0}–{Math.min(offset + COMPARISON_PAGE_SIZE, ids.length)} / {ids.length}</span>
        </div>
        {live && <p className="text-xs text-amber-300">A Bank pass is running. Decisions are temporarily unavailable.</p>}
        <p className="text-2xs text-content-subtle">K keep · R reject · U undecide · ← → pages · Esc close</p>
      </footer>
      {detailId != null && <BankReviewLightbox bankId={bankId} collectionId={collectionId}
        ids={pageIds.filter((id) => meta[id] && !missing.has(id))} startId={detailId}
        seedImages={pageIds.map((id) => meta[id]).filter(Boolean)}
        onDecided={(id, status) => { setMeta((old) => ({ ...old, [id]: { ...old[id], status } })); onChanged?.(); }}
        onClose={() => { setDetailId(null); setRetry((old) => old + 1); }} />}
    </div>
  );
}
