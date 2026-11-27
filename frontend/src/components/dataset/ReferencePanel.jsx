import { useRef, useState } from 'react';
import IdentityPromptModal from './IdentityPromptModal';
// Engine names come from the derived edit list — spelling them out here is how
// this tooltip ended up naming two engines while a third could already edit.
import { editEngineNames, pendingEditNote } from './referenceEdit';
import { btnClass } from '../common/controls';

// Same limit as backend MAX_EXTRA_REFS in face_dataset_service.
const MAX_EXTRA_REFS = 3;

export default function ReferencePanel({ refFilename, datasetId, onSetRef, onCropRef, onEditRef, busy,
                                         importBusy = busy, visionBusy = false, nonce = 0,
                                         extraRefs = [], onAddExtraRef, onRemoveExtraRef,
                                         onCropExtraRef, subjectType = 'human',
                                         referenceEdit = null }) {
  const inp = useRef(null);
  const inpExtra = useRef(null);
  // Auto head-crop = OPT-IN (vision pass, pauses ComfyUI). Default OFF: upload is
  // instant (centered square) and ✂ Crop adjusts manually — faster in practice.
  const [autoCrop, setAutoCrop] = useState(false);
  // ✎ next to the Extra-refs "+": the identity instruction those extra photos
  // ride on is a GLOBAL setting buried in Settings ▸ Image engines — reachable
  // here, in the one place where the user is thinking about identity locking.
  const [promptModal, setPromptModal] = useState(false);
  const imgUrl = (fn) => `/api/dataset/${datasetId}/img/${encodeURIComponent(fn)}${nonce ? `?v=${nonce}` : ''}`;
  // An edit that already landed and is waiting for Keep or Discard. It matters
  // most after a restart: the modal only opens on a click, so without this the
  // paid result would sit unannounced until the TTL deleted it.
  const waiting = onEditRef ? pendingEditNote(referenceEdit) : null;
  return (
    <div className="lds-section flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-lg bg-black overflow-hidden shrink-0 flex items-center justify-center">
          {refFilename
            ? <img src={imgUrl(refFilename)} alt="ref" className="w-full h-full object-cover" />
            : <span className="text-content-subtle text-xs">none</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-content text-sm font-medium">Reference photo</span>
            {waiting && (
              // A button, not a label: the whole point is to lead somewhere, and
              // the modal it opens is where Keep and Discard live.
              <button type="button" onClick={onEditRef} disabled={busy}
                title="Open the edit to compare it with the current reference, then Keep or Discard"
                className="px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10
                           text-amber-300 text-2xs font-medium disabled:opacity-40">
                ✦ {waiting} →
              </button>
            )}
          </div>
          <div className={`grid items-center gap-1.5 ${refFilename ? (onEditRef ? 'grid-cols-3' : 'grid-cols-2') : 'grid-cols-1'}`}>
            <button type="button" onClick={() => inp.current?.click()} disabled={importBusy}
              className={btnClass({ size: 'sm' })}>
              {refFilename ? 'Change' : 'Set Reference'}
            </button>
            {refFilename && (
              <button type="button" onClick={onCropRef} disabled={busy}
                className={btnClass({ size: 'sm' })}>✂ Crop</button>
            )}
            {refFilename && onEditRef && (
              <button type="button" onClick={onEditRef} disabled={busy}
                title={`Edit with ${editEngineNames()}.`}
                className={btnClass({ size: 'sm' })}>✦ Edit</button>
            )}
            <label className="col-span-full flex min-h-10 items-center gap-1 text-xs text-content-muted cursor-pointer lg:min-h-0"
              title={visionBusy ? 'Unavailable during generation.' : 'Crop around the face. Pauses ComfyUI.'}>
              <input type="checkbox" checked={autoCrop} disabled={visionBusy} onChange={(e) => setAutoCrop(e.target.checked)}
                className="accent-indigo-500 w-3 h-3" />
              ✂ Auto head-crop{visionBusy ? ' (generation active)' : ''}
            </label>
          </div>
          <input ref={inp} type="file" accept="image/*" className="hidden" disabled={importBusy}
            onChange={(e) => { if (e.target.files[0]) onSetRef(e.target.files[0], { autoCrop: autoCrop && !visionBusy }); e.target.value = ''; }} />
        </div>
      </div>

      {/* Références additionnelles — identité multi-angles pour Klein, chaînées
          en ReferenceLatent natifs. PAS Krea 2 Edit : son unique slot secondaire
          a été entraîné pour un sujet DIFFÉRENT, donc il lit une image ajoutée
          dans la modale ✦ Edit reference, jamais ce vivier-ci. Recadrables une
          par une (✂ sur la vignette) ; le scoring reste sur la principale. */}
      {refFilename && (
        <div className="flex items-center gap-2 flex-wrap border-t border-border pt-2">
          <span className="text-content-subtle text-2xs">
            Extra References
          </span>
          {extraRefs.map((fn) => (
            <div key={fn} className="relative w-12 h-12 rounded-lg overflow-hidden bg-black shrink-0">
              <img src={imgUrl(fn)} alt="extra reference" className="w-full h-full object-cover" />
              <button type="button" onClick={() => onRemoveExtraRef?.(fn)} disabled={busy}
                aria-label="Remove this extra reference"
                title="Remove this extra reference"
                className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded-bl bg-black/70 text-white text-2xs leading-none disabled:opacity-40">
                ✕
              </button>
              {/* ✂ in the OPPOSITE corner of ✕: the tile is 48 px, two 16 px targets
                  diagonally apart never overlap and stay reachable. */}
              <button type="button" onClick={() => onCropExtraRef?.(fn)} disabled={busy}
                aria-label="Crop this extra reference"
                title="Crop extra reference."
                className="absolute bottom-0 left-0 w-4 h-4 flex items-center justify-center rounded-tr bg-black/70 text-white text-2xs leading-none disabled:opacity-40">
                ✂
              </button>
            </div>
          ))}
          {extraRefs.length < MAX_EXTRA_REFS && (
            <button type="button" onClick={() => inpExtra.current?.click()} disabled={importBusy}
              aria-label="Add an extra reference photo (other angles of the same face)"
              title="Add a reference for Klein."
              className="w-12 h-12 rounded-lg border border-dashed border-border-strong text-content-muted text-xl leading-none disabled:opacity-40">
              +
            </button>
          )}
          <button type="button" onClick={() => setPromptModal(true)}
            aria-label="Edit the identity instruction used with multiple references"
            title="Edit identity instructions."
            className="w-6 h-6 rounded-lg border border-border-strong text-content-muted text-xs leading-none hover:bg-surface-raised">
            ✎
          </button>
          <input ref={inpExtra} type="file" accept="image/*" className="hidden" disabled={importBusy}
            onChange={(e) => { if (e.target.files[0]) onAddExtraRef?.(e.target.files[0]); e.target.value = ''; }} />
        </div>
      )}
      {/* The modal edits the prompts of THIS dataset's subject — a human lock
          shown on an Animal dataset is what made an animal-tuned text leak into
          human generations. */}
      {promptModal && <IdentityPromptModal subjectType={subjectType} onClose={() => setPromptModal(false)} />}
    </div>
  );
}
