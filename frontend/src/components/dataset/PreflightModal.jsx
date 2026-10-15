/** Interactive pre-training preflight. Keeps the aggregate warning message but
 * drills into WHICH captions leak identity (editable in place, saves on blur)
 * and WHICH kept images are near-duplicates (reject one per pair) — so the
 * offenders get fixed right at the confirm, not hunted down in the grid after.
 * Replaces the old blocking window.confirm: onResolve(true) = start anyway,
 * onResolve(false) = cancel. */
import { useEffect, useRef, useState } from 'react';
import { postJson } from '../../api/fetchClient';
import { Button } from '../common/Controls.jsx';

export default function PreflightModal({ report, datasetId, ds, onResolve, reviewOnly = false, onDecision }) {
  const { warnings = [], leak_images: leaks = [], dup_pairs: dups = [] } = report || {};
  // Divergence 4: upstream also renders a "this run is billed per hour on a rented
  // GPU" variant here, keyed off report.lane === 'cloud'. This fork has no rental
  // lane to reach it, so the copy is absent rather than present-and-unreachable.
  const [rejected, setRejected] = useState({});   // imageId -> true (rejected in place)
  const [approved, setApproved] = useState({});
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const imgUrl = (fn) => `/api/dataset/${datasetId}/img/${encodeURIComponent(fn)}`;
  const pairKey = (pair) => [pair.a.id, pair.b.id].sort((a, b) => a - b).join(':');
  const isRejected = (id) => rejected[id] || ds.data?.images?.some((image) => image.id === id && image.status === 'reject');
  const isUnkept = (id) => rejected[id] || ds.data?.images?.some((image) => image.id === id && image.status !== 'keep');
  const close = () => { if (!pendingRef.current) onResolve(false); };

  // Escape cancels, like dismissing a native confirm.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !pendingRef.current) onResolve(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve]);

  const decide = async (key, save) => {
    if (pendingRef.current || ds.curationBusy) return;
    if (ds.currentId != null && String(ds.currentId) !== String(datasetId)) {
      setError('The dataset changed. Reopen the pair review.');
      return;
    }
    pendingRef.current = true;
    setPending(key); setError('');
    try { await save(); }
    catch (failure) { setError(failure?.message || 'Could not save the decision. Try again.'); }
    finally { pendingRef.current = false; setPending(null); }
  };
  const reject = (id) => decide(`reject:${id}`, async () => {
    if (ds.data?.images && !ds.data.images.some((image) => image.id === id)) {
      throw new Error('The dataset changed. Reopen the pair review.');
    }
    const result = await ds.setStatus(id, 'reject');
    if (!result?.ok) throw new Error(result?.error || 'Could not reject this copy.');
    setRejected((previous) => ({ ...previous, [id]: true }));
    onDecision?.();
  });
  const keepBoth = (pair) => decide(`both:${pairKey(pair)}`, async () => {
    const result = await postJson(`/api/dataset/${datasetId}/duplicates/keep-both`, {
      image_ids: [pair.a.id, pair.b.id],
      fingerprints: { [pair.a.id]: pair.a.fingerprint, [pair.b.id]: pair.b.fingerprint },
    });
    if (!result?.ok) throw new Error(result?.error || 'Could not keep both copies.');
    setApproved((previous) => ({ ...previous, [pairKey(pair)]: true }));
    onDecision?.();
  });

  return (
    <div role="dialog" aria-modal="true"
      aria-label={reviewOnly ? 'Near Duplicates' : 'Before training'}
      /* z-[9992], one notch above the 9990 modals: ▶ Continue now stays OPEN
         while its request is in flight, and this report is the question raised
         on top of it. At the same layer the continue dialog won (it portals to
         document.body, so it comes last in the DOM) and this modal — whose
         promise the launch is awaiting — was invisible. */
      className="fixed inset-0 z-[9992] bg-black/80 flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`w-full ${reviewOnly ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] overflow-y-auto rounded-xl border border-amber-400/40 bg-app p-4 flex flex-col gap-3`}>
        <div className="sticky top-0 z-10 flex items-start gap-2 bg-app py-2">
          <span className="text-amber-300 font-semibold text-sm">
            <span aria-hidden>⚠</span> {reviewOnly ? 'Near Duplicates' : 'Before Training'}
          </span>
          <Button type="button" size="sm" noShrink onClick={close} disabled={!!pending}
            className="ml-auto" aria-label={reviewOnly ? 'Close' : 'Cancel'}>✕</Button>
        </div>
        {/* Summary — the aggregate message, kept verbatim. */}
        {warnings.length > 0 && (
          <ul className="m-0 pl-4 flex flex-col gap-1 text-content-muted text-xs list-disc">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        {/* WHICH captions leak — edit in place (saves when you click away). */}
        {leaks.length > 0 && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-2.5 flex flex-col gap-2">
            <span className="text-amber-300 text-xs font-semibold">
              Captions describing the identity ({leaks.length}) — remove the face / hair words
            </span>
            {leaks.map((li) => (
              <div key={li.id} className="flex gap-2 items-start">
                <img src={imgUrl(li.filename)} alt={`image ${li.id}`} loading="lazy"
                  className="w-14 h-14 rounded object-cover shrink-0 bg-black" />
                <textarea defaultValue={li.caption} rows={2}
                  aria-label={`Caption of image ${li.id}`}
                  onBlur={(e) => { if (e.target.value !== li.caption) ds.setCaption(li.id, e.target.value); }}
                  className="flex-1 bg-app/60 border border-amber-400/30 rounded px-2 py-1 text-2xs text-content resize-y" />
              </div>
            ))}
          </div>
        )}

        {/* WHICH pairs are near-duplicate — reject one of each. */}
        {dups.length > 0 && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-2.5 flex flex-col gap-2">
            <span className="text-amber-300 text-xs font-semibold">
              Near-duplicate pairs ({dups.length}). Reject one copy or keep both.
            </span>
            <p className="m-0 text-sm text-content-muted">
              Keep Both saves your choice for this pair. Editing either image makes it eligible for review again.
            </p>
            {dups.map((p, i) => {
              const unkept = isUnkept(p.a.id) || isUnkept(p.b.id);
              const keptBoth = approved[pairKey(p)] && !unkept;
              const resolved = keptBoth || unkept;
              return (
                <div key={i} role="group" aria-label={`Pair ${i + 1}`} className={`space-y-3 rounded-lg border border-border p-3 ${resolved ? 'opacity-60' : ''}`}>
                  <p className="m-0 text-sm font-semibold text-content">Pair {i + 1}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[p.a, p.b].map((im, copy) => (
                      <div key={im.id} className="flex min-w-0 flex-col items-center gap-2">
                        <img src={imgUrl(im.filename)} alt={`Copy ${copy + 1}`} loading="lazy"
                          className={`${reviewOnly ? 'h-56 w-full sm:h-72' : 'h-24 w-full'} rounded object-contain bg-black ${isRejected(im.id) ? 'ring-2 ring-red-500 grayscale' : ''}`} />
                        <Button type="button" size="sm" disabled={!!resolved || !!pending || ds.curationBusy}
                          aria-label={`Reject Copy ${copy + 1}`}
                          onClick={() => reject(im.id)}
                          className="border-red-500/40 bg-red-500/15 text-red-300">
                          {pending === `reject:${im.id}` ? 'Saving' : isRejected(im.id) ? '✕ Rejected' : 'Reject'}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span role="status" className="text-sm text-emerald-400">
                      {resolved ? (keptBoth ? 'Both Kept' : '✓ Resolved') : ''}
                    </span>
                    <Button type="button" size="sm" disabled={!!resolved || !!pending || ds.curationBusy || !p.a.fingerprint || !p.b.fingerprint}
                      onClick={() => keepBoth(p)}>
                      {pending === `both:${pairKey(p)}` ? 'Saving' : 'Keep Both'}
                    </Button>
                  </div>
                  {!resolved && (!p.a.fingerprint || !p.b.fingerprint) && (
                    <p className="m-0 text-xs text-amber-300">Pair details are unavailable. Reopen this review to retry.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p role="alert" className="m-0 text-sm text-red-300">{error}</p>}
        <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-app py-2">
          <Button type="button" onClick={close} disabled={!!pending}>
            {reviewOnly ? 'Done' : 'Cancel'}
          </Button>
          {!reviewOnly && <Button type="button" onClick={() => onResolve(true)} disabled={!!pending}
            variant="primary" className="ml-auto">
            Start Anyway
          </Button>}
        </div>
      </div>
    </div>
  );
}
