import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, postForm, postJson } from '../../api/fetchClient.js';
import CropModal from '../dataset/CropModal.jsx';

const BUTTON = 'min-h-10 min-w-0 rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40 hover:bg-surface-raised';
const FIELD = 'min-h-10 w-full min-w-0 rounded-md border border-border bg-surface px-2 py-2 text-sm text-content';
const batches = (ids) => Array.from({ length: Math.ceil(ids.length / 16) }, (_, n) => ids.slice(n * 16, n * 16 + 16));

export function IdentityFilter({ source, scopeId, value = '', onChange, version = 0 }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const seen = useRef(new Map());
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch('/api/identities?q=' + encodeURIComponent(query), { signal: controller.signal })
        .then((data) => {
          for (const identity of data.identities) seen.current.set(identity.id, identity);
          setRows(data.identities); setError('');
        })
        .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    }, query ? 250 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [source, scopeId, version, query]);
  const options = value && !rows.some((row) => row.id === value) && seen.current.has(value)
    ? [seen.current.get(value), ...rows] : rows;
  return <div className="grid w-full min-w-0 grid-cols-2 gap-2 text-xs">
    <input aria-label="Find Identity" placeholder="Find Identity" className={FIELD}
      value={query} onChange={(event) => setQuery(event.target.value)} />
    <select aria-label="Identity Filter" className={FIELD} value={value || ''}
      onChange={(event) => onChange(event.target.value)}>
      <option value="">All Identities</option>
      {options.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.kind === 'person' ? 'Person' : 'Anime'})</option>)}
    </select>
    {error && <span role="alert" className="col-span-2 text-danger">{error}</span>}
  </div>;
}

export default function IdentityTools({ source, scopeId, imageIds, busy = false, onChanged, defaultKind = 'anime' }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [kind, setKind] = useState(defaultKind);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [series, setSeries] = useState('');
  const [catalogChoice, setCatalogChoice] = useState(null);
  const [replaceIdentity, setReplaceIdentity] = useState(null);
  const [roster, setRoster] = useState([]);
  const [target, setTarget] = useState('');
  const [single, setSingle] = useState(false);
  const [learn, setLearn] = useState(true);
  const [regions, setRegions] = useState({});
  const [state, setState] = useState(null);
  const [prepared, setPrepared] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [tagRows, setTagRows] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [engine, setEngine] = useState('wd14');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undoOffer, setUndoOffer] = useState(null);
  const [crop, setCrop] = useState(false);
  const [natural, setNatural] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [minimum, setMinimum] = useState(defaultKind === 'person' ? '0.55' : '0.70');
  const [margin, setMargin] = useState('0.05');
  const titleId = useId();
  const stop = useRef(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const upload = useRef(null);
  const previews = useRef(new Map());
  const reloadVersion = useRef(0);
  const ids = focusId ? [focusId] : imageIds;
  const previewId = ids.length === 1 ? ids[0] : null;
  const base = '/api/identity/' + source + '/' + scopeId;
  const imageUrl = previewId ? base + '/image/' + previewId : '';
  const idsKey = imageIds.join(',');

  const reload = useCallback(async () => {
    const version = ++reloadVersion.current;
    const chosen = focusId ? [focusId] : imageIds;
    setPrepared(false);
    previews.current.clear();
    if (!chosen.length) { setState(null); return; }
    let first, count = 0;
    for (const batch of batches(chosen)) {
      const data = await postJson(base + '/view', { image_ids: batch });
      if (version !== reloadVersion.current) return;
      previews.current.set(batch.join(','), data);
      first ||= data;
      count += batch.length;
      if (count < chosen.length) setNotice(count + ' prepared of ' + chosen.length + '.');
    }
    const offer = await apiFetch(base + '/undo');
    if (version !== reloadVersion.current) return;
    setState(first); setUndoOffer(offer.operation_id); setPrepared(true);
  }, [base, idsKey, focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    if (working) return;
    if (name && !window.confirm('Discard the unsaved name?')) return;
    setOpen(false);
  }, [name, working]);
  const closeRef = useRef(close);
  const cropRef = useRef(crop);
  closeRef.current = close;
  cropRef.current = crop;

  useEffect(() => {
    if (!open) return;
    let live = true;
    reload().catch((failure) => { if (live) setError(failure.message); });
    apiFetch('/api/identities?kind=' + kind)
      .then((data) => { if (live) setRoster(data.identities); })
      .catch((failure) => { if (live) setError(failure.message); });
    return () => { live = false; reloadVersion.current += 1; };
  }, [open, kind, reload]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!cropRef.current) closeRef.current(); }
      if (event.key !== 'Tab' || cropRef.current) return;
      const fields = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]')];
      const first = fields[0], last = fields.at(-1);
      if (!fields.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open || kind !== 'anime' || name.trim().length < 2) { setCatalog([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => apiFetch('/api/identities/catalog?q=' + encodeURIComponent(name), { signal: controller.signal })
      .then((data) => setCatalog(data.characters))
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [name, kind, open]);

  async function perform(fn) {
    if (working) return;
    stop.current = false;
    setWorking(true); setError(''); setNotice('');
    try {
      await fn();
      onChanged?.();
      await reload();
    } catch (failure) { setError(failure.message || 'Identity operation failed.'); }
    finally { setWorking(false); }
  }

  async function assign() {
    await perform(async () => {
      let identity = roster.find((row) => row.id === target);
      if (!identity) {
        identity = await postJson('/api/identities', { name, kind, series,
          aliases: aliases.split(',').map((value) => value.trim()).filter(Boolean),
          catalog_tag: catalogChoice?.tag });
        setRoster((rows) => [...rows.filter((row) => row.id !== identity.id), identity]);
        setTarget(identity.id);
      }
      let count = 0;
      let operationId = null;
      for (const batch of batches(ids)) {
        if (stop.current) break;
        const preview = previews.current.get(batch.join(','));
        if (!preview) throw new Error('Selection preview expired. Reopen the panel.');
        const result = await postJson(base + '/assign', {
          ...preview, image_ids: batch, identity_id: identity.id, regions,
          single_subject: single, learn,
          replace_identity_id: replaceIdentity,
          operation_id: operationId,
        });
        operationId = result.operation_id;
        setUndoOffer(operationId);
        count += result.assigned;
        setNotice(count + ' assigned of ' + ids.length + (result.learning?.reason ? '. ' + result.learning.reason : ''));
      }
      setName('');
      setReplaceIdentity(null);
    });
  }

  async function findMatches() {
    await perform(async () => {
      if (!minimum.trim() || !margin.trim() || !Number.isFinite(Number(minimum)) || !Number.isFinite(Number(margin))) {
        throw new Error('Enter valid match settings.');
      }
      const found = [];
      let count = 0, unknown = 0;
      for (const batch of batches(ids)) {
        if (stop.current) break;
        const preview = await postJson(base + '/view', { image_ids: batch });
        await postJson(base + '/analyze', { ...preview, image_ids: batch, kind, regions });
        const result = await postJson(base + '/suggest', {
          image_ids: batch, kind, minimum: Number(minimum), margin: Number(margin),
        });
        found.push(...result.suggestions); unknown += result.unmeasured.length;
        count += batch.length; setSuggestions([...found]);
        setNotice(count + ' checked of ' + ids.length + '. ' + unknown + ' unmeasured. Thresholds are starting heuristics.');
      }
    });
  }

  async function findTags() {
    await perform(async () => {
      const found = [];
      for (const batch of batches(ids)) {
        if (stop.current) break;
        const preview = await postJson(base + '/view', { image_ids: batch });
        const result = await postJson(base + '/tags', { ...preview, image_ids: batch, engine });
        found.push(...result.images); setTagRows([...found]);
      }
      setNotice('Character tags are suggestions. They do not teach identity until confirmed.');
    });
  }

  async function decide(subject, identity, action) {
    await perform(async () => {
      const result = await postJson('/api/identity/subjects/' + subject.id + '/decision', {
        identity_id: identity, action, revision: subject.revision, single_subject: single,
      });
      setUndoOffer(result.operation_id);
      setSuggestions((rows) => rows.filter((row) => row.subject_id !== subject.id));
      setNotice(action === 'confirm' ? 'Example confirmed.' : 'Decision saved.');
    });
  }

  async function undo() {
    await perform(async () => {
      const result = await postJson('/api/identity/actions/' + undoOffer + '/undo', {});
      setNotice(result.restored + ' restored. ' + result.skipped + ' skipped because later work exists.');
      setSuggestions([]);
    });
  }

  function chooseCatalog(item) {
    setName(item.name); setTarget('');
    setSeries(item.series || ''); setCatalogChoice(item);
    setCatalog([]);
  }

  return <>
    <button ref={trigger} type="button" className={BUTTON} data-identity-open
      disabled={busy || !imageIds.length} onClick={() => { setOpen(true); setError(''); setSuggestions([]); setTagRows([]); }}>
      Assign Identity{imageIds.length ? ' (' + imageIds.length + ')' : ''}
    </button>
    {open && createPortal(<div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 p-3 sm:p-6" data-probe-layer>
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-xl bg-surface p-4 text-content shadow-xl"
        data-probe-panel="identity-dialog">
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-base font-semibold">Identities</h2>
          <button type="button" className={BUTTON} disabled={working} onClick={close}>Close</button>
        </div>
        <p className="text-xs text-content-muted">{ids.length} selected. Preview shows up to 16 images. Actions process every selected image.</p>
        {focusId && <button type="button" className={BUTTON} disabled={working} onClick={() => setFocusId(null)}>All Selected</button>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs">Kind
            <select className={FIELD} value={kind} disabled={working}
              onChange={(event) => { setKind(event.target.value); setTarget(''); setSuggestions([]); setMinimum(event.target.value === 'person' ? '0.55' : '0.70'); }}>
              <option value="person">Person</option><option value="anime">Anime</option>
            </select>
          </label>
          <label className="min-w-0 text-xs">Existing Identity
            <select className={FIELD} value={target} disabled={working} onChange={(event) => setTarget(event.target.value)}>
              <option value="">New Identity</option>{roster.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          {!target && <label className="min-w-0 text-xs sm:col-span-2">Name
            <input autoComplete="off" className={FIELD} maxLength={100} value={name} disabled={working}
              onChange={(event) => { setName(event.target.value); setCatalogChoice(null); }} />
          </label>}
          {!target && <label className="min-w-0 text-xs">Aliases
            <input className={FIELD} value={aliases} disabled={working}
              placeholder="Comma-separated names" onChange={(event) => setAliases(event.target.value)} />
          </label>}
          {!target && kind === 'anime' && <label className="min-w-0 text-xs">Series
            <input className={FIELD} maxLength={200} value={series} disabled={working}
              onChange={(event) => setSeries(event.target.value)} />
          </label>}
        </div>
        {catalog.length > 0 && <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto" aria-label="Character Vocabulary">
          {catalog.map((item) => <button type="button" className={BUTTON} key={item.tag} onClick={() => chooseCatalog(item)}>{item.name}</button>)}
        </div>}
        {previewId && <div className="flex min-w-0 flex-col items-start gap-2">
          <img src={imageUrl} alt="Selected subject" className="max-h-56 max-w-full rounded-md object-contain"
            onLoad={(event) => setNatural({ width: event.target.naturalWidth, height: event.target.naturalHeight })} />
          <div className="grid w-full grid-cols-2 gap-2">
            <button type="button" className={BUTTON} disabled={working || !natural} onClick={() => setCrop(true)}>Choose Subject</button>
            <button type="button" className={BUTTON} disabled={working || !regions[previewId]}
              onClick={() => setRegions((prior) => { const next = { ...prior }; delete next[previewId]; return next; })}>Whole Image</button>
          </div>
          {regions[previewId] && <span className="text-xs">Subject Crop Selected</span>}
        </div>}
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={learn} disabled={working} onChange={(event) => setLearn(event.target.checked)} />Learn Identity</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={single} disabled={working} onChange={(event) => setSingle(event.target.checked)} />One Character</label>
        </div>
        <p className="text-xs text-content-muted">For several characters, choose a subject crop. Only confirmed examples teach identity. Captions and image decisions stay unchanged.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={BUTTON} disabled={working || !prepared || (!target && !name.trim())} onClick={assign}>{replaceIdentity ? 'Correct Name' : 'Assign'}</button>
          <button type="button" className={BUTTON} disabled={working || !undoOffer} onClick={undo}>Undo</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">Minimum Similarity<input className={FIELD} type="number" min="-1" max="1" step="0.01" value={minimum} disabled={working} onChange={(event) => setMinimum(event.target.value)} /></label>
          <label className="text-xs">Ambiguity Margin<input className={FIELD} type="number" min="0" max="1" step="0.01" value={margin} disabled={working} onChange={(event) => setMargin(event.target.value)} /></label>
        </div>
        <button type="button" className={BUTTON} disabled={working} onClick={findMatches}>Find Matches</button>
        {kind === 'anime' && <div className="grid grid-cols-2 gap-2">
          <select aria-label="Character Tagger" className={FIELD} disabled={working} value={engine} onChange={(event) => setEngine(event.target.value)}>
            <option value="wd14">WD14</option><option value="pixai">PixAI</option>
          </select>
          <button type="button" className={BUTTON} disabled={working} onClick={findTags}>Suggest Names</button>
          <button type="button" className={BUTTON} disabled={working} onClick={() => upload.current.click()}>Import Catalog</button>
          <a className={BUTTON + ' text-center'} href="#/setup?step=quality">Setup</a>
          <input ref={upload} className="hidden" type="file" accept=".csv" onChange={(event) => {
            const file = event.target.files?.[0]; if (!file) return;
            perform(async () => { const data = new FormData(); data.append('file', file); const result = await postForm('/api/identities/catalog/import', data); setNotice(result.imported + ' catalog entries imported.'); });
            event.target.value = '';
          }} />
        </div>}
        {working && <button type="button" className={BUTTON} onClick={() => { stop.current = true; setNotice('Stop requested. The current batch will finish.'); }}>Stop</button>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {state?.images.map((image, index) => <div key={image.id} className="flex flex-col gap-2">
          <span className="text-xs font-semibold">Image {index + 1}</span>
          {image.subjects.map((subject) => <div key={subject.id} className="flex flex-wrap items-center gap-2">
            {subject.region && <button type="button" className={BUTTON} disabled={working}
              onClick={() => { setFocusId(image.id); setRegions((prior) => ({ ...prior, [image.id]: subject.region })); }}>Select Subject</button>}
            {subject.assignments.filter((row) => row.state === 'confirmed').map((row) => <div key={row.identity_id} className="flex min-w-0 items-center gap-2">
              <span className="break-words text-sm">{row.name}</span>
              <button type="button" className={BUTTON} disabled={working}
                onClick={() => {
                  setReplaceIdentity(row.identity_id); setFocusId(image.id);
                  setKind(row.kind); setTarget(''); setName(''); setAliases('');
                  setSingle(subject.single_subject);
                  setRegions((prior) => ({ ...prior, [image.id]: subject.region }));
                }}>Correct Name</button>
              <button type="button" className={BUTTON} disabled={working} onClick={() => decide(subject, row.identity_id, 'remove')}>Remove Name</button>
            </div>)}
          </div>)}
        </div>)}
        {suggestions.map((suggestion) => <div key={suggestion.subject_id} className="flex flex-col gap-2">
          <p className="break-words text-sm">{suggestion.identity.name} · {suggestion.score.toFixed(3)} · {suggestion.state === 'suggested' ? 'Suggested' : 'Uncertain'}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={BUTTON} disabled={working} onClick={() => decide({ id: suggestion.subject_id, revision: suggestion.revision }, suggestion.identity.id, 'confirm')}>Confirm</button>
            <button type="button" className={BUTTON} disabled={working} onClick={() => decide({ id: suggestion.subject_id, revision: suggestion.revision }, suggestion.identity.id, 'reject')}>Reject Match</button>
          </div>
        </div>)}
        {tagRows.map((row, index) => <div key={row.image_id} className="flex flex-wrap gap-2">
          <span className="text-xs">Image {index + 1}</span>
          {row.candidates.map((item) => <button type="button" key={item.tag} className={BUTTON} disabled={working}
            title="Use this suggested name for this image"
            onClick={() => { setFocusId(row.image_id); setName(item.tag.replaceAll('_', ' ')); setCatalogChoice({ tag: item.tag }); setTarget(''); }}>
            {item.tag.replaceAll('_', ' ')} · {item.score.toFixed(2)}
          </button>)}
        </div>)}
      </section>
    </div>, document.body)}
    {crop && createPortal(<div className="relative z-[110]"><CropModal imageUrl={imageUrl} onCancel={() => setCrop(false)}
      onConfirm={(box) => { setRegions((prior) => ({ ...prior, [previewId]: [box.x / natural.width, box.y / natural.height, box.w / natural.width, box.h / natural.height] })); setCrop(false); }} /></div>, document.body)}
  </>;
}
