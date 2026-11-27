/** Drop / pick real photos to import into the dataset.
 *
 * The dropzone used to say "normalized to 1024" and nothing else — no why, no
 * way out (reported by Qeeyana on Reddit: "why? Let me choose not to"). It now
 * states what will be stored, its safety limit, and links to the setting that
 * changes it. The value comes from capabilities, never from a copy of the
 * default kept here: a hint that can go stale is worse than no hint.
 */
import { useRef, useState } from 'react';
import { ImageDown } from 'lucide-react';
import { useCapabilities } from '../../context/CapabilitiesContext';
import SettingsLink from '../common/SettingsLink';
import {
  IMPORT_IMAGE_ACCEPT,
  importInputLimitLine,
  importPolicyLine,
} from './importPolicy.js';

export default function ImportDropzone({ onImport, busy, visionBusy = false, cropOption = false, defaultCrop = false }) {
  const { caps } = useCapabilities();
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const importPolicy = caps?.dataset_import;
  const inputLimit = importInputLimitLine(importPolicy);
  // Auto head-crop (square, vision pass). OFF keeps the original file and
  // framing — a bust/body photo stays a bust/body photo (aspect kept, no padding).
  // Head cropping is opt-in. Importing photos should preserve their framing.
  const [crop, setCrop] = useState(defaultCrop);
  const autoCropEnabled = cropOption && crop && !visionBusy;


  const handle = (files) => {
    if (busy) return; // drop events bypass pointer-events-none — guard here too (I2)
    // `policy` rides along so the hook can split the drop by the SERVER's two
    // limits (files and bytes per request) instead of a copy kept here.
    if (files && files.length) onImport(files, { crop: cropOption ? crop && !visionBusy : false, policy: importPolicy });
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-3 lg:p-4 cursor-pointer text-center
        ${over ? 'border-primary bg-primary/10' : 'border-border bg-surface'} ${busy ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <ImageDown aria-hidden="true" className="h-5 w-5 lg:h-6 lg:w-6" />
      <span className="text-content text-sm font-medium lg:text-base">Import Photos</span>
      <span className="text-content-muted text-xs lg:text-sm">
        {autoCropEnabled ? 'Auto head-crop on' : importPolicyLine(importPolicy)}
      </span>
      <span onClick={(e) => e.stopPropagation()}
        className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-content-muted">
        <span>Rejects files over {inputLimit}.</span>
        <span>HEIC, HEIF and AVIF convert to PNG.</span>
        <SettingsLink section="captioning" focus="dataset-import-encoding">Storage Mode</SettingsLink>
        <SettingsLink section="captioning" focus="image-input-max-pixels">Size Limit</SettingsLink>
      </span>
      {cropOption && (
        <label onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs text-content-muted cursor-pointer lg:text-sm"
          title={visionBusy ? 'Unavailable during generation.' : 'Crop to a square headshot. Saves a WebP copy.'}>
          <input type="checkbox" checked={crop} disabled={visionBusy} onChange={(e) => setCrop(e.target.checked)}
            className="accent-indigo-500 w-3 h-3" />
          ✂ Auto head-crop (square){visionBusy ? ' (generation active)' : ''}
        </label>
      )}
      <input ref={inputRef} type="file" accept={IMPORT_IMAGE_ACCEPT} multiple className="hidden"
        onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
