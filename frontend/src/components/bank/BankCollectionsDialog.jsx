import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, postJson } from '../../api/fetchClient';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button, IconButton, Input, Select } from '../common/Controls.jsx';
import { imageVersionQuery } from './bankEdits.js';
import PromoteDialog from './PromoteDialog.jsx';

const PAGE_SIZE = 24;

export default function BankCollectionsDialog({ bankId, bankName, initialIds = [], onClose, onOpenGrid, onCompare, onChanged }) {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState(() => new Set());
  const [newName, setNewName] = useState('');
  const [draftNames, setDraftNames] = useState({});
  const [targetId, setTargetId] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [promotion, setPromotion] = useState(null);
  const [unavailable, setUnavailable] = useState(() => new Set());
  const writeRef = useRef(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, !promotion);
  const collections = list?.collections || [];
  const current = collections.find((collection) => collection.id === selectedId) || null;
  const target = collections.find((collection) => collection.id === Number(targetId));
  const members = detail?.collection?.id === selectedId ? detail.members : [];
  const count = current?.count || 0;
  const dirty = newName.trim() || collections.some((collection) => draftNames[collection.id] != null
    && draftNames[collection.id] !== collection.name);
  const ready = current && detail?.collection?.id === current.id;

  const loadList = useCallback(async () => {
    const result = await apiFetch(`/api/bank/${bankId}/collections`);
    setList(result);
    setSelectedId((old) => result.collections.some((collection) => collection.id === old) ? old : result.collections[0]?.id ?? null);
    return result;
  }, [bankId]);

  useEffect(() => {
    let active = true;
    apiFetch(`/api/bank/${bankId}/collections`).then((result) => {
      if (!active) return;
      setList(result); setSelectedId(result.collections[0]?.id ?? null);
    }).catch((failure) => { if (active) setError(failure.message || 'Could not load collections.'); });
    return () => { active = false; };
  }, [bankId]);

  useEffect(() => {
    let active = true;
    setDetail(null);
    if (selectedId == null) return;
    apiFetch(`/api/bank/${bankId}/collections/${selectedId}?offset=${offset}&limit=${PAGE_SIZE}`)
      .then((result) => { if (active) setDetail(result); })
      .catch((failure) => { if (active) setError(failure.message || 'Could not load collection members.'); });
    return () => { active = false; };
  }, [bankId, offset, selectedId, version]);

  const close = useCallback(() => {
    if (writeRef.current || promotion) return;
    if (dirty && !window.confirm('Discard unsaved collection names?')) return;
    onClose();
  }, [dirty, onClose, promotion]);
  useEffect(() => {
    const key = (event) => {
      if (promotion) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close, promotion]);

  const apply = async (operation, args = {}, row = current) => {
    if (writeRef.current) return false;
    writeRef.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await postJson(operation === 'create'
        ? `/api/bank/${bankId}/collections` : `/api/bank/${bankId}/collections/${row.id}`,
      operation === 'create' ? { name: newName, image_ids: initialIds }
        : { operation, revision: row.revision, ...args });
      if (result?.ok === false) throw new Error(result.error || 'Could not save this change.');
      if (result.collections) setList(result);
      else setList((old) => ({ collections: [result.collection, ...(old?.collections || [])], undo: result.collection }));
      const nextId = result.collection_id ?? result.collection?.id;
      if (nextId != null) setSelectedId(result.collections
        ? (result.collections.some((collection) => collection.id === nextId) ? nextId : result.collections[0]?.id ?? null)
        : nextId);
      setOffset(0); setSelection(new Set()); setConfirmDelete(false); setTargetId('');
      if (operation === 'create' || (operation === 'split' && !args.target_id)) setNewName('');
      if (operation === 'rename') setDraftNames((old) => {
        const next = { ...old }; delete next[row.id]; return next;
      });
      setVersion((old) => old + 1);
      setNotice('Collection saved. Image status and source files unchanged.');
      onChanged?.(result);
      // A list reload failing after an accepted save is not a failed mutation.
      if (!result.collections) loadList().catch(() => setNotice('Collection created. Reload the list to refresh its counts.'));
      return true;
    } catch (failure) {
      setError(failure.message || 'Could not save. Names and selection are retained.');
      return false;
    } finally {
      writeRef.current = false; setBusy(false);
    }
  };

  const promote = async () => {
    if (writeRef.current || !current) return;
    writeRef.current = true; setBusy(true); setError(null);
    try {
      const result = await apiFetch(`/api/bank/${bankId}/collections/${current.id}/promotable`);
      if (!result.ids?.length) throw new Error('No available kept images in this collection.');
      setPromotion({ collection: current, ids: result.ids });
    } catch (failure) { setError(failure.message || 'Could not prepare promotion.'); }
    finally { writeRef.current = false; setBusy(false); }
  };

  const open = async (comparison) => {
    if (writeRef.current || !current) return;
    writeRef.current = true; setBusy(true); setError(null);
    try {
      if (dirty && !window.confirm('Discard unsaved collection names?')) return;
      if (comparison) await onCompare(current);
      else onOpenGrid(current);
    } catch (failure) { setError(failure.message || 'Could not open this collection.'); }
    finally { writeRef.current = false; setBusy(false); }
  };

  if (promotion) return <div className="relative z-[70]">
    <PromoteDialog bankId={bankId} bankName={`${bankName || 'Bank'}: ${promotion.collection.name}`}
      collectionId={promotion.collection.id} selectedIds={promotion.ids}
      onClose={() => setPromotion(null)}
      onStarted={() => { setPromotion(null); setVersion((old) => old + 1); onChanged?.(); }} />
  </div>;

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Bank Collections"
    data-probe-chrome="bank-collections" data-probe-layer
    className="fixed inset-0 z-[70] flex min-h-0 flex-col bg-surface-overlay">
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <h2 className="grow text-base font-semibold text-content">Collections</h2>
      <Button disabled={busy} onClick={() => loadList().then(() => setVersion((old) => old + 1)).catch((failure) => setError(failure.message))}>Reload</Button>
      <IconButton label="Close collections" disabled={busy} onClick={close}>✕</IconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="shrink-0 space-y-2 border-b border-border p-3">
      <p className="text-xs text-content-muted">Collections store membership only. Keep / Reject, captions, and source files stay independent.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (newName.trim()) apply('create'); }}>
        <Input aria-label="New collection name" placeholder="New collection name" maxLength={128}
          value={newName} onChange={(event) => setNewName(event.target.value)} disabled={busy}
          className="min-w-0 grow basis-40" />
        <Button type="submit" disabled={busy || !newName.trim()}>Create</Button>
        <span className="self-center text-xs text-content-muted">{initialIds.length} incoming images</span>
      </form>
      {list?.undo && <div className="flex items-center gap-2 text-xs text-content-muted">
        <span className="min-w-0 grow truncate" title={list.undo.name}>Last change: {list.undo.name}</span>
        <Button disabled={busy} onClick={() => apply('undo', {}, list.undo)}>Undo</Button>
      </div>}
      <div className="min-h-5 text-xs">
        {error ? <p role="alert" className="text-rose-300">{error}</p>
          : <p role="status" className="text-content-muted">{busy ? 'Saving' : notice || '\u00a0'}</p>}
      </div>
    </div>
    <div className="flex flex-col lg:flex-row">
      <aside className="max-h-36 shrink-0 overflow-y-auto border-b border-border p-2 lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r">
        {!list && <p className="text-sm text-content-muted">Loading collections</p>}
        {list && !collections.length && <p className="text-sm text-content-muted">No collections yet. Enter a name and select Create.</p>}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {collections.map((collection) => <Button key={collection.id} disabled={busy}
            aria-pressed={selectedId === collection.id}
            className="min-w-0 justify-between text-left"
            onClick={() => { setSelectedId(collection.id); setOffset(0); setSelection(new Set()); setConfirmDelete(false); setTargetId(''); }}>
            <span className="min-w-0 truncate" title={collection.name}>{collection.name}</span>
            <span className="ml-2 shrink-0 tabular-nums">{collection.count}</span>
          </Button>)}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {current && <div className="shrink-0 space-y-2 border-b border-border p-3">
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Collection name" value={draftNames[current.id] ?? current.name} maxLength={128}
              disabled={busy} className="min-w-0 grow basis-40"
              onChange={(event) => setDraftNames((old) => ({ ...old, [current.id]: event.target.value }))} />
            <Button disabled={busy || !(draftNames[current.id] ?? current.name).trim()}
              onClick={() => apply('rename', { name: draftNames[current.id] ?? current.name })}>Rename</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button disabled={busy} onClick={() => open(false)}>Open Grid</Button>
            <Button disabled={busy} onClick={() => open(true)}>Compare</Button>
            <Button disabled={busy} onClick={promote}>Promote Kept</Button>
            <Button disabled={busy} onClick={() => setConfirmDelete(true)}>Delete Collection</Button>
          </div>
          {confirmDelete && <div className="space-y-2 rounded border border-rose-400/50 p-2">
            <p className="text-xs text-content">Delete this collection? Images and other collections remain.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busy} onClick={() => apply('delete')}>Delete Collection</Button>
              <Button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>}
        </div>}
        <div className="p-3">
          {current && !ready && <p className="text-sm text-content-muted">Loading members</p>}
          {ready && count === 0 && <p className="text-sm text-content-muted">This collection is empty. Add the incoming selection or create a collection from a group.</p>}
          {members.some((member) => member.missing || unavailable.has(member.id)) && <p className="mb-2 text-xs text-amber-300">Unavailable sources remain members. Promotion skips missing sources.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {members.map((member) => <label key={member.id} className="min-w-0 cursor-pointer overflow-hidden rounded border border-border">
              <span className="flex aspect-square items-center justify-center bg-black/40">
                {member.image && !member.missing && !unavailable.has(member.id) ? <img loading="lazy"
                  src={`/api/bank/${bankId}/thumb/${member.id}${imageVersionQuery(member.image)}`}
                  alt={member.label} className="h-full w-full object-contain"
                  onError={() => setUnavailable((old) => new Set(old).add(member.id))} />
                  : <span className="text-xs text-content-muted">{member.missing ? 'Missing Source' : 'Preview Unavailable'}</span>}
              </span>
              <span className="flex min-h-10 items-center gap-2 px-2 text-xs text-content">
                <input type="checkbox" checked={selection.has(member.id)} disabled={busy}
                  onChange={() => setSelection((old) => {
                    const next = new Set(old); if (next.has(member.id)) next.delete(member.id); else next.add(member.id); return next;
                  })} />
                <span className="min-w-0 truncate" title={member.label}>{member.label}</span>
              </span>
            </label>)}
          </div>
        </div>
        {current && <footer className="shrink-0 space-y-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button disabled={busy || !initialIds.length} onClick={() => apply('members', { add_ids: initialIds })}>Add Incoming</Button>
            <Button disabled={busy || !selection.size} onClick={() => apply('members', { remove_ids: [...selection] })}>Remove Selected</Button>
            <Button disabled={busy || !members.length} onClick={() => setSelection((old) => new Set([...old, ...members.map((member) => member.id)]))}>Select Page</Button>
          </div>
          <details className="rounded border border-border p-2">
            <summary className="flex min-h-10 cursor-pointer items-center text-sm font-semibold text-content">Merge &amp; Split</summary>
          <div className="flex flex-wrap gap-2 pt-2">
            <Select aria-label="Destination collection" value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={busy} className="min-w-0 grow basis-40">
              <option value="">New Collection</option>
              {collections.filter((collection) => collection.id !== current.id).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </Select>
            <Button disabled={busy || !target} onClick={() => apply('merge', { target_id: target.id, target_revision: target.revision })}>Merge Into</Button>
            <Button disabled={busy || !selection.size || (targetId && !target) || (!target && !newName.trim())}
              onClick={() => apply('split', { image_ids: [...selection], ...(target
                ? { target_id: target.id, target_revision: target.revision } : { name: newName }) })}>Split Selected</Button>
          </div>
          {targetId && !target && <p role="alert" className="pt-2 text-xs text-rose-300">Destination collection is unavailable. Reload or choose another.</p>}
          {!target && selection.size > 0 && <p className="pt-2 text-xs text-content-muted">For a new split, enter its name in the New collection name field.</p>}
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy || offset === 0} onClick={() => setOffset((old) => old - PAGE_SIZE)}>Previous</Button>
            <Button disabled={busy || offset + PAGE_SIZE >= count} onClick={() => setOffset((old) => old + PAGE_SIZE)}>Next</Button>
            <Button disabled={busy || !selection.size} onClick={() => setSelection(new Set())}>Clear Selection</Button>
            <span className="text-xs text-content-muted">{selection.size} selected · {count ? offset + 1 : 0}–{Math.min(offset + PAGE_SIZE, count)} / {count}</span>
          </div>
        </footer>}
      </main>
    </div>
    </div>
  </div>;
}
