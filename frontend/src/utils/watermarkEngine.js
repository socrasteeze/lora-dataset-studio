/* Which engine 🚩 Find watermarks will run — the pure half, mirroring the
 * backend's `watermark_detector.resolve_backend` case for case.
 *
 * The whole choice existed server-side (`watermark_detect.backend`, an honest
 * resolver, a fallback that SAYS so) with no UI anywhere — which is how the
 * maintainer came to ask "we can't choose the detection model?" about a choice
 * the backend had been honouring all along. These helpers feed the selector
 * both scan windows now carry.
 *
 * Mirroring matters more than sharing here: the sentence shown BEFORE the run
 * must describe the route the server will actually take, so every branch below
 * matches a branch of resolve_backend, and the parity test pins both sides.
 */
import { activeLocalLlm, localLlmLabel } from './localLlm.js';

export const WATERMARK_ENGINES = [
  { id: 'auto', label: 'Auto' },
  { id: 'detector', label: 'Dedicated Detector' },
  { id: 'vision', label: 'Vision Model' },
];

/** Where the detector installs from — the backend names the same route. */
export const DETECTOR_INSTALL_ROUTE = 'Setup ▸ Quality tools ▸ Watermark detector';

export function normalizeEngine(value) {
  const v = String(value || '').trim().toLowerCase();
  return WATERMARK_ENGINES.some((e) => e.id === v) ? v : 'auto';
}

/** What a scan launched NOW will actually run, and the sentence saying so.
 *
 *  Returns {runs: 'detector'|'vision', line, warn} — `warn` is true only for
 *  the one case that deserves amber: detector pinned, extra missing (the run
 *  still happens, on the vision route, exactly like the backend's fell_back).
 */
export function watermarkEngineStatus(choice, caps = {}) {
  const picked = normalizeEngine(choice);
  const installed = !!caps.watermark_detect;
  const llm = activeLocalLlm(caps);
  const model = llm.vision_model || 'the loaded model';
  const visionLine = `Vision model: ${model} via ${localLlmLabel(caps)}.`;
  if (picked === 'vision') {
    return { runs: 'vision', line: visionLine, warn: false };
  }
  if (installed) {
    return {
      runs: 'detector', warn: false,
      line: 'Detector: SigLIP2 + Grounding DINO.',
    };
  }
  if (picked === 'detector') {
    return {
      runs: 'vision', warn: true,
      line: `Using vision model. Install the detector in ${DETECTOR_INSTALL_ROUTE}.`,
    };
  }
  return { runs: 'vision', warn: false, line: visionLine };
}

/** The config write that arms the vision route's model — `{provider}.vision_model`
 *  is what the vision scan reads, on both surfaces and in Settings ▸ Local tools. */
export function visionModelSetting(provider, model) {
  const key = provider === 'lmstudio' ? 'lmstudio' : 'ollama';
  return { [key]: { vision_model: String(model || '').trim() } };
}

/** Caps with the vision model swapped for the one just picked, so the status
 *  sentence names it at once instead of after the next capabilities refresh. */
export function withVisionModel(caps = {}, provider, model) {
  const key = provider === 'lmstudio' ? 'lmstudio' : 'ollama';
  return { ...caps, [key]: { ...(caps[key] || {}), vision_model: model } };
}

/** The pull affordance in each provider's own words — Ollama pulls, LM Studio
 *  downloads — over the ONE routed endpoint (/api/local-llm/pull). */
export function pullCopy(provider) {
  return provider === 'lmstudio'
    ? { button: '⏬ Download', busy: 'Downloading', inputLabel: 'LM Studio model to download',
      placeholder: 'qwen/qwen3-vl-4b — or a huggingface.co model URL' }
    : { button: '⏬ Pull', busy: 'Pulling', inputLabel: 'Ollama model to pull',
      placeholder: 'qwen2.5vl:7b' };
}
