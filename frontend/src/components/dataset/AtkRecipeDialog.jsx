import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useUnsavedWork } from '../../hooks/useUnsavedWork';
import { HelpBadge } from '../../help/HelpMode';
import { btnClass, fieldClass } from '../common/controls';

const NUMBERS = [
  ['learning_rate', 'Learning Rate', '0.00002'],
  ['min_lr', 'Minimum LR', '0.000001'],
  ['max_lr', 'Maximum LR', '0.00002'],
  ['weight_decay', 'Weight Decay', '0.0001'],
  ['caption_dropout_rate', 'Caption Dropout', '0'],
  ['conv', 'Conv Rank', '16'],
  ['conv_alpha', 'Conv Alpha', '16'],
  ['loss_sync_every', 'Loss Sync Interval', '4'],
  ['sample_width', 'Preview Width', '832'],
  ['sample_height', 'Preview Height', '1216'],
  ['sample_seed', 'Preview Seed', '42'],
];
const FLAGS = [
  ['cache_latents', 'RAM Latent Cache'],
  ['cache_text_embeddings', 'Text Embedding Cache'],
  ['unload_text_encoder', 'Unload Text Encoder'],
  ['bypass_guidance_embedding', 'Bypass Guidance Embedding'],
  ['skip_first_sample', 'Skip First Preview'],
  ['sample_walk_seed', 'Walk Preview Seed'],
];

function draftFrom(settings) {
  return {
    ...Object.fromEntries(NUMBERS.map(([key]) => [key, settings[key] == null ? '' : String(settings[key])])),
    ...Object.fromEntries(FLAGS.map(([key]) => [key, settings[key] == null ? '' : String(settings[key])])),
    ignore_if_contains: (settings.ignore_if_contains || []).join('\n'),
    sample_negative_prompt: settings.sample_negative_prompt ?? '',
    negativeOverride: settings.sample_negative_prompt != null,
  };
}

function readDraft(key, base) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key));
    if (!saved || !saved.draft || Object.keys(base).some((field) => typeof saved.draft[field] !== typeof base[field])) return null;
    return saved;
  } catch { return null; }
}

export default function AtkRecipeDialog({ settings, optimizer, instanceId, onSave, onClose }) {
  const [base] = useState(() => draftFrom(settings));
  const storageKey = instanceId ? `lds:atk-recipe-draft:${instanceId}` : null;
  const [recovery] = useState(() => storageKey ? readDraft(storageKey, base) : null);
  const [draft, setDraft] = useState(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recovered, setRecovered] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [showRecovery, setShowRecovery] = useState(Boolean(recovery));
  const dialogRef = useRef(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  useFocusTrap(dialogRef);
  useUnsavedWork(dirty || busy);

  const clearDraft = () => {
    if (!storageKey) return;
    try { window.sessionStorage.removeItem(storageKey); } catch { setStorageError(true); }
  };
  const change = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setError('');
    if (storageKey) {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({ base, draft: next }));
        setStorageError(false);
      } catch { setStorageError(true); }
    }
  };
  const dismiss = () => {
    if (busy || (dirty && !window.confirm('Discard unsaved recipe changes?'))) return;
    if (dirty) clearDraft();
    onClose();
  };
  useEffect(() => {
    const escape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss();
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  });

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    const patch = {};
    for (const [key, label] of NUMBERS) {
      if (draft[key] === base[key]) continue;
      const value = draft[key].trim() ? Number(draft[key]) : null;
      if (value != null && !Number.isFinite(value)) {
        setError(`${label} must be a finite number.`);
        return;
      }
      patch[key] = value;
    }
    for (const [key] of FLAGS) {
      if (draft[key] !== base[key]) patch[key] = draft[key] === '' ? null : draft[key] === 'true';
    }
    if (draft.ignore_if_contains !== base.ignore_if_contains) patch.ignore_if_contains = draft.ignore_if_contains;
    if (draft.negativeOverride !== base.negativeOverride || draft.sample_negative_prompt !== base.sample_negative_prompt) {
      patch.sample_negative_prompt = draft.negativeOverride ? draft.sample_negative_prompt : null;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await onSave(patch);
      if (!saved) { setError('Recipe was not saved. Correct the reported setting and retry.'); return; }
      clearDraft();
      onClose();
    } catch {
      setError('Recipe was not saved. Check the connection and retry.');
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9991] flex items-center justify-center bg-black/80 p-3 sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="atk-recipe-title"
        onSubmit={save} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
          <h2 id="atk-recipe-title" className="m-0 text-base font-semibold text-content">ATK Recipe <HelpBadge topic="training.atk_recipe" /></h2>
          <button type="button" onClick={dismiss} disabled={busy} className={btnClass()}>Close</button>
        </header>
        <fieldset disabled={busy} className="m-0 min-h-0 min-w-0 space-y-4 overflow-y-auto border-0 p-4">
          <p className="m-0 text-xs text-content-muted">Blank numbers use defaults. LR limits apply only to Automagic3. Caption dropout uses a fraction from 0 to 1.</p>
          {showRecovery && <div role="status" className="space-y-2 text-sm text-amber-300">
            <p>A local draft exists. It is not saved to the dataset.{JSON.stringify(recovery.base) !== JSON.stringify(base) ? ' Saved settings have changed.' : ''}</p>
            <div className="flex gap-2">
              <button type="button" className={btnClass()} onClick={() => { setDraft(recovery.draft); setRecovered(true); setShowRecovery(false); }}>Restore Draft</button>
              <button type="button" className={btnClass()} onClick={() => { clearDraft(); setShowRecovery(false); }}>Discard Draft</button>
            </div>
          </div>}
          {recovered && <p role="status" className="text-xs text-amber-300">Local draft restored. Review it before you save.</p>}
          {storageError && <p role="status" className="text-xs text-amber-300">Local recovery is unavailable. Keep this dialog open until you save.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {NUMBERS.map(([key, label, example]) => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-content">
              <span>{label}</span>
              <input type="text" inputMode="decimal" value={draft[key]} placeholder={`Auto (example: ${example})`}
                disabled={((key === 'min_lr' || key === 'max_lr') && optimizer !== 'automagic3') || (key === 'learning_rate' && optimizer === 'prodigy')}
                onChange={(event) => change(key, event.target.value)} className={`${fieldClass()} w-full`} />
            </label>)}
            {FLAGS.map(([key, label]) => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-content">
              <span>{label}</span>
              <select value={draft[key]} onChange={(event) => change(key, event.target.value)} className={`${fieldClass()} w-full`}>
                <option value="">Auto</option><option value="true">On</option><option value="false">Off</option>
              </select>
            </label>)}
          </div>
          <p className="m-0 text-xs text-content-muted">RAM caching uses system memory. Anima caches text embeddings by default. ATK unloads cached encoders even when Unload Text Encoder is off.</p>
          <label className="flex flex-col gap-1 text-xs text-content">
            <span>Layer Exclusions</span>
            <textarea rows={7} value={draft.ignore_if_contains} onChange={(event) => change('ignore_if_contains', event.target.value)}
              spellCheck={false} className="w-full min-w-0 rounded-md border border-border bg-surface p-2 font-mono text-xs text-content" />
            <span className="text-content-muted">Enter one layer-name substring per line. These patterns exclude matching layers from LoRA training.</span>
          </label>
          <label className="training-toggle-chip">
            <input type="checkbox" checked={draft.negativeOverride} onChange={(event) => change('negativeOverride', event.target.checked)} />
            <span>Override Preview Negative</span>
          </label>
          {draft.negativeOverride && <label className="flex flex-col gap-1 text-xs text-content">
            <span>Preview Negative</span>
            <textarea rows={3} maxLength={4000} value={draft.sample_negative_prompt} onChange={(event) => change('sample_negative_prompt', event.target.value)}
              className="w-full min-w-0 rounded-md border border-border bg-surface p-2 text-content" />
            <span className="text-content-muted">Leave this empty to use no negative prompt.</span>
          </label>}
        </fieldset>
        <footer className="shrink-0 space-y-2 border-t border-border p-4">
          {error && <p role="alert" className="m-0 text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={dismiss} className={`${btnClass()} flex-1`}>Cancel</button>
            <button type="submit" disabled={busy || !dirty || showRecovery} className={`${btnClass({ variant: 'primary' })} flex-1`}>{busy ? 'Saving' : 'Save Recipe'}</button>
          </div>
        </footer>
      </form>
    </div>, document.body);
}
