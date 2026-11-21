/**
 * ⚙ The analysis passes — the old ① Analyze zone, now a PANEL opened on demand
 * from the top bar.
 *
 * Why it moved. The passes are the step you run once per bank and then leave
 * alone for days, and they were occupying the top third of a screen whose
 * subject is the grid. Opening them on demand gives that third back to the
 * images without taking a single pass away.
 *
 * ⚠️ This is a CONTAINER, not a rewrite. All eight passes are here, each still
 * opening its own PassDialog with its own endpoint, scope and refusals. Nothing
 * about what a button does changed — only where you reach it from. The
 * bank-wide read-only overview rides along, because "what has been measured"
 * and "what can I measure" are the same question asked twice.
 */
import BankOverview from './BankOverview.jsx'
import { Palette, Ruler, Search, Users } from 'lucide-react';
import BankEditPanel from './BankEditPanel.jsx'
import BankSemanticEngine from './BankSemanticEngine.jsx'
import BankWatermarkPanel from './BankWatermarkPanel'
import { GroupLabel, PassButton } from './BankAtoms.jsx'
import SettingsLink from '../common/SettingsLink'
import DevicePicker from '../common/DevicePicker'
import { captionButtonLabel, captionScopeNote } from './bankCaptionScope.js'
import { holdsTheGpu } from './bankScoreDevice.js'
import { activeLocalLlm, localLlmLabel } from '../../utils/localLlm'
import { Button } from '../common/Controls.jsx'

/* Below lg the panel folds everything that is not a pass button. Measured by
   the responsive probe at 360 px: the panel was ~1 500 px tall — engine card,
   eight buttons, watermark and edit panels, notes, overview, all stacked — so
   opening it cost two screens. The buttons are what you came for; each
   secondary block is one tap away, with its name on the fold. From lg up the
   layout is unchanged. */
function Fold({ compact, title, children }) {
  if (!compact) return children
  return (
    <details className="lds-section">
      <summary className="min-h-10 cursor-pointer select-none py-2 text-sm text-content-muted hover:text-content">
        {title}
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  )
}

export default function BankPassesPanel({
  bankId, payload, counts, live, caps, capsLoading, compact = false,
  semanticState, semanticReady, semanticBlocked, semanticSwitching, semanticOperationBusy,
  scoreGpuPresent, scoreDevice,
  selected, captionScope,
  captionVocab, visionModel, visionModelLooksUncensored,
  onPassOpen, onPassRedo, onPickPython, onSemanticEngineChange, onChanged,
  watermarkMethod, onWatermarkMethod, watermarkDevice, onWatermarkDevice,
  // Divergence 6 (peer dispatch) + the fork's own 🔖 Tags pass. Upstream's panel
  // gates on caps.* directly and has no device concept; here a pass can be aimed
  // at another machine, so the gate is passGate (which folds the peer's own
  // readiness in) and the picker rides with the buttons it governs.
  passGate, passDevice, tagsState, tagsLabel,
  onPassDevice, onPassDeviceObj, onStartTags, onStartPixaiTags, onImportCaptions,
}) {
  // Which Settings field this warning opens depends on the configured provider:
  // sending an LM Studio user to the Ollama model field is a dead end, in a
  // warning whose whole job is to point at a real place.
  const visionModelFocus = activeLocalLlm(caps).provider === 'lmstudio'
    ? 'lmstudio-vision-model' : 'ollama-vision-model'
  return (
    <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
      <div className="min-w-0 space-y-3 xl:col-span-5">
        <Fold compact={compact} title="Semantic engine">
        <BankSemanticEngine state={semanticState} capsLoading={capsLoading}
          switching={semanticSwitching} disabled={semanticOperationBusy} live={live}
          gpuPresent={scoreGpuPresent}
          onPickPython={() => onPickPython('semantic')}
          onChange={onSemanticEngineChange}
          onIndex={() => {
            // The visible “Reindex” promise and the request body agree on first
            // open; incomplete indexes resume with rescan:false.
            onPassRedo('semantic_index', semanticState.complete)
            onPassOpen('semantic_index')
          }} />
        </Fold>

        {/* Analysis passes — individual, quieter than the primary actions. */}
        <div className="space-y-1.5">
          <GroupLabel>Analysis passes</GroupLabel>
          <div className="grid auto-rows-fr grid-cols-2 gap-1.5 [&>*:last-child:nth-child(odd)]:col-span-2">
            {/* Launch windows carry scope counts and rescan options. */}
            <PassButton onClick={() => onPassOpen('scan')} disabled={live}
              title="Measure sharpness, noise, flatness, size and detail, hash every image and group the exact duplicates — CPU only. Opens the launch window.">
              <Search aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Scan Quality
            </PassButton>
            <PassButton onClick={() => onPassOpen('faces')} disabled={live || !passGate.faces.ok}
              title={passGate.faces.reason || (passGate.faces.ok
                ? 'Detect the dominant face of every non-rejected image and cluster the bank by person (no reference needed). CPU, can take a while on thousands of images. It samples your subfolders first and offers the ones that look like a single person, so you can skip them.'
                : 'Install the Quality tools (Setup) to sort by person')}>
              <Users aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Group by Person
            </PassButton>
            <PassButton onClick={() => onPassOpen('score')} disabled={live || !passGate.score.ok}
              title={passGate.score.reason || (passGate.score.ok
                ? `Rate every non-rejected image for aesthetics (1–10), flag NSFW, and group by visual style — one CLIP pass. Powers a smarter "keep best". Already-scored images are reused, so stopping and relaunching costs only what is left. Runs in the background${
                  !scoreDevice ? ', while its scoring device is being checked'
                    : holdsTheGpu(scoreDevice) ? ', and holds the GPU (ComfyUI is unloaded and training cannot start) for its duration' : ' on the CPU, leaving the GPU free'}.`
                : 'Install the Bank scoring extra (Setup ▸ Quality tools) to score aesthetics / NSFW / style')}>
              Score
            </PassButton>
            <PassButton onClick={() => onPassOpen('medium')} disabled={live || !caps.bank_scoring}
              title={caps.bank_scoring
                ? 'Sort every scored image into photograph / anime / 3D render / illustration — read off the CLIP embeddings Score already computed, so no image is looked at again and the GPU stays free. It answers “unsure” rather than guessing: measured on a real 23 500-image bank, it named 2 anime drawings and no wrong verdict.'
                : 'Install the Bank scoring extra (Setup ▸ Quality tools) — Medium reads the embeddings the Score pass produces'}>
              <Palette aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Classify Medium
            </PassButton>
            <PassButton onClick={() => onPassOpen('framing')} disabled={live || !passGate.framing.ok}
              title={passGate.framing.reason || (passGate.framing.ok
                ? 'Classify every non-rejected image by shot type — face close-up, bust, full body, back view — with the same Qwen3-VL classifier the datasets use. Powers the Framing filter and the coverage advice. GPU vision pass.'
                : 'Pull the vision model (Settings ▸ Local tools) to classify framing')}>
              <Ruler aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Classify Framing
            </PassButton>
            {/* 🔖 Tags — the cheap pass that makes the expensive one optional for
                triage. No device picker: it is local-only (see startTags). */}
            <PassButton onClick={onStartTags} disabled={live || tagsState.disabled}
              title={tagsState.title}>
              {tagsLabel}
            </PassButton>
            <PassButton onClick={onStartPixaiTags} disabled={live || capsLoading || !caps.pixai}
              title={caps.pixai
                ? (selected.size ? 'Cache PixAI tags for selected images. Captions stay unchanged.'
                  : 'Cache PixAI tags for kept and pending images. Captions stay unchanged.')
                : 'Install PixAI Tagger in Setup.'}>
              PixAI Pre-Tags{counts?.pixai_tagged > 0 && ` (${counts.pixai_tagged})`}
            </PassButton>
            <PassButton onClick={() => onPassOpen('semantic_dedup')} disabled={live || !semanticReady}
              title={semanticReady
                ? `Group crops and re-compressed variants of the SAME shot the exact-duplicate hash misses from the ${semanticState.label} semantic index. Review them under the ✂ Same shot chip.`
                : semanticBlocked}>
              ✂ Find Crops &amp; Variants
            </PassButton>
            {/* The label QUOTES THE NUMBER IT WILL MOVE — the scope's uncaptioned rows,
                or the selection when there is one. "Caption all" was the older, vaguer
                promise, and a button that announces one figure and acts on another is the
                misunderstanding this whole row exists to end.

                IT NO LONGER GREYS OUT AT ZERO. It used to, and it took the engine, the
                model, the register and the length pickers down with it — on exactly the
                bank whose captions you wanted redone with a better model. The window is
                always reachable; the LAUNCH button inside it is what refuses a run of 0,
                and it says why. */}
            <PassButton onClick={() => onPassOpen('caption')} disabled={live || !passGate.caption.ok}
              title={passGate.caption.reason || (selected.size
                ? `Caption the ${selected.size} selected image(s). Opens the window with the engine, model, register, length and scope.`
                : `${captionScopeNote(selected.size, counts, captionScope)} Opens the window with the engine, model, register, length and scope.`)}>
              {captionButtonLabel(selected.size, counts, captionScope)}
            </PassButton>
            <PassButton onClick={onImportCaptions} disabled={live || !onImportCaptions}
              title="Copy a same-name .txt file into each empty caption and mark it as written by you. Leaves stored captions and the files themselves unchanged.">
              Import Captions
            </PassButton>
            {/* ⤢ the opt-in angle backfill. Its own button and its own window, never
                folded into 👥: it is hours of work on a big bank and nobody must pay
                it by accident. Shown only when there is something to measure. */}
            {(counts?.angle_backfillable || 0) > 0 && (
              <PassButton onClick={() => onPassOpen('angles')} disabled={live}
                title="Measure the head angle of the images a previous build face-scanned without keeping it. Writes the angle and nothing else.">
                ⤢ Measure Head Angles
              </PassButton>
            )}
          </div>
          {!capsLoading && !caps.pixai && (
            <a href="#/setup" className="text-sm text-accent underline">Install PixAI</a>
          )}
          <div className="grid grid-cols-2 gap-1.5 empty:hidden [&>*:only-child]:col-span-2">
            {/* Which machine these passes run on. Launch all has offered this
                for a while and these buttons ignored it entirely, so the same
                five passes behaved differently depending on which button you
                pressed. Self-hides with no peers. 🔎 Scan and 🔖 Tags are
                absent from the gate on purpose: they never travel. */}
            <DevicePicker value={passDevice} onChange={onPassDevice}
              onDevice={onPassDeviceObj} kind="bank-pass" size="md" className="[&>select]:max-w-none [&>select]:flex-1" />
            {/* Import detection cannot prove a CUDA calculation works. Keep the
                recovery route accessible even when detection looks healthy. */}
            {onPickPython && (
              <Button type="button" size="md" onClick={() => onPickPython('scoring')}
                disabled={live || semanticOperationBusy}
                title="Inspect, test or change the Python used by Score">
                Manage Score Python
              </Button>
            )}
          </div>
          {/* Watermark CLEANING — the two manual levels (crop, then inpaint), with
              their own per-level progress. Lives in its own component so the
              "which level can run, and why not" logic stays unit-tested. */}
          <BankWatermarkPanel bankId={bankId} live={live}
            onFind={() => onPassOpen('watermark')}
            onFindText={() => onPassOpen('text_scan')}
            payload={payload} selectedIds={[...selected]}
            method={watermarkMethod} onMethodChange={onWatermarkMethod}
            deviceId={watermarkDevice} onDeviceChange={onWatermarkDevice}
            scanDevice={passDevice} onScanDeviceChange={onPassDevice}
            onScanDevice={onPassDeviceObj}
            gpuPresent={scoreGpuPresent} onPickPython={onPickPython}
            onChanged={onChanged} />
          {/* ✂ Edits — the crop and the upscale made in the Bank itself, next to
              the watermark cleaning because they are the same KIND of thing: the
              three actions that produce new pixels, each undone by throwing away
              a copy the app made (nofaceman, Discord). */}
          <Fold compact={compact} title="Edits">
          <BankEditPanel bankId={bankId} live={live}
            payload={payload} selectedIds={[...selected]}
            onChanged={onChanged} />
          </Fold>
          {!capsLoading && !caps.bank_scoring && (
            <p className="text-xs text-content-muted">
              Install Score in Setup ▸ Quality Tools, or select a Python that has it.
            </p>
          )}
          {captionVocab === 'explicit' && !visionModelLooksUncensored && (
            <p className="text-xs text-amber-400/90">
              ⚠️ Explicit captions need an uncensored {localLlmLabel(caps)} vision model.
              {visionModel && ` ${visionModel} may refuse explicit terms.`}{' '}
              <SettingsLink section="local-tools" focus={visionModelFocus} tone="warning">
                Local Tools
              </SettingsLink>
            </p>
          )}
        </div>
      </div>
      <div className="min-w-0 xl:col-span-7">
        <BankOverview payload={payload} compact={compact} />
      </div>
    </div>
  )
}
