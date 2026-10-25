import { useState } from 'react';
import { CheckCircle2, Loader2, Tags } from 'lucide-react';
import { postJson } from '../../api/fetchClient';
import { Button, Input } from '../common/Controls.jsx';
import FolderPickerField from '../common/FolderPicker.jsx';
import { HelpBadge } from '../../help/HelpMode';

/** Caption a folder LDS did not build, as Anima character booru tags
 * (POST /api/captions/external-recaption). The source folder is only read:
 * one .txt per image goes to the OUTPUT folder, and no image is copied or moved.
 *
 * The call is synchronous (the vision model runs over every image before it
 * answers), so the dialog shows a busy state, not a per-image count, and stays
 * open until the answer arrives. A blank traits field OMITS the key: an empty
 * list means "strip nothing", while no key means "apply the suggested list".
 * The answer also names the summary file (trigger, count tags, traits) the
 * service writes beside the captions, and its line, ready to copy. */
export default function ExternalRecaptionDialog({ onClose }) {
  const [source, setSource] = useState('');
  const [output, setOutput] = useState('');
  const [trigger, setTrigger] = useState('');
  const [traits, setTraits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const ready = Boolean(source.trim() && output.trim() && trigger.trim());

  const run = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    setResult(null);
    const body = { source: source.trim(), output: output.trim(), trigger: trigger.trim() };
    if (traits.trim()) body.signature_tags = traits;
    try {
      setResult(await postJson('/api/captions/external-recaption', body));
    } catch (err) {
      // A 503 says only "GPU busy"; its detail names what holds the GPU.
      setError(err?.body?.detail || err?.message || 'Captioning failed.');
    } finally {
      setBusy(false);
    }
  };

  const list = (tags) => (tags?.length ? tags.join(', ') : 'none');

  return (
    <div role="dialog" aria-modal="true" aria-label="Caption an outside folder"
      data-probe-chrome="external-recaption" data-probe-layer
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
      {/* A <div>, not a <form>: the folder browser renders its own address-bar
          form inside this tree, and its submit would bubble into ours. */}
      <div
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface-overlay p-4 sm:p-5 shadow-2xl space-y-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-content">
          <Tags aria-hidden="true" className="h-4 w-4" /> Caption an outside folder
          <HelpBadge topic="external-folder-recaption" />
        </h2>
        <p className="text-sm text-content-muted">
          Writes Anima character booru tags (<code>trigger, 1girl, solo, …</code>) for
          each image directly inside a folder LDS did not build.
        </p>
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Captions go only to the output folder, never beside the source images.
          Images are never copied or moved.
        </p>

        <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
          <FolderPickerField id="external-recaption-source" label="Source folder"
            value={source} onChange={setSource} required
            hint="Images directly inside it. Subfolders are not read." />
          <FolderPickerField id="external-recaption-output" label="Output folder"
            value={output} onChange={setOutput} required
            hint="Gets one .txt per image, plus a summary .txt named after this folder. A .txt with the same name is replaced. Type a new path to create it." />
          <div>
            <label htmlFor="external-recaption-trigger" className="block text-sm font-medium text-content">Trigger word</label>
            <Input id="external-recaption-trigger" value={trigger} required
              onChange={(e) => setTrigger(e.target.value)} spellCheck={false}
              className="mt-1 w-full font-mono" />
          </div>
          <div>
            <label htmlFor="external-recaption-traits" className="block text-sm font-medium text-content">
              Signature traits <span className="font-normal text-content-subtle">(optional)</span>
            </label>
            <Input id="external-recaption-traits" value={traits}
              onChange={(e) => setTraits(e.target.value)} spellCheck={false}
              placeholder="red eyes, armor" className="mt-1 w-full" />
            <p className="mt-1 text-xs text-content-muted">
              Comma-separated. Kept out of every caption so they bind to the trigger.
              Leave empty to apply the suggested list.
            </p>
          </div>
        </fieldset>

        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-content-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
            Captioning the folder. This can take several minutes; keep this open.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 break-words">
            {error}
          </p>
        )}
        {result && (
          <div role="status" className="space-y-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-content">
            <p className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-400" />
              {result.written} written, {result.skipped} skipped
            </p>
            <p className="text-xs text-content-muted break-all">
              Output: <span className="font-mono">{result.output_dir}</span>
            </p>
            <p className="text-xs text-content-muted">Suggested traits: {list(result.suggested_signature_tags)}</p>
            <p className="text-xs text-content-muted">Applied traits: {list(result.signature_tags)}</p>
            {result.summary && (
              <div className="pt-1">
                <p className="text-xs text-content-muted break-all">
                  Summary file: <span className="font-mono">{result.summary_file}</span>
                </p>
                <p className="mt-0.5 rounded bg-surface-raised px-2 py-1 font-mono text-xs text-content break-words select-all">
                  {result.summary}
                </p>
              </div>
            )}
            {result.skipped > 0 && (
              <p className="text-xs text-content-subtle">A skipped image got no tags, so no .txt was written for it.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="primary" onClick={run} disabled={busy || !ready}>
            {busy ? 'Captioning' : 'Caption Folder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
