import { useState } from 'react';
import { clearCaptionDraft, readCaptionDraft, writeCaptionDraft } from '../utils/captionDraft.js';

function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

export function useCaptionDraft(key, caption = '', short = '') {
  const base = { caption: caption || '', short: short || '' };
  const [state, setState] = useState(() => ({ key, base,
    ...readCaptionDraft(browserStorage(), key, base) }));
  // A picker can switch images without unmounting its dialog.
  if (state.key !== key) {
    setState({ key, base, ...readCaptionDraft(browserStorage(), key, base) });
  }
  const change = (field, value) => {
    const next = { ...state, [field]: value };
    const saved = writeCaptionDraft(browserStorage(), key, state.base, next);
    setState({ ...next, unavailable: !saved, conflict: null });
  };
  const clear = () => clearCaptionDraft(browserStorage(), key);
  const restore = () => {
    if (!state.conflict) return;
    const next = { ...state, caption: state.conflict.caption, short: state.conflict.short,
      conflict: null, recovered: true };
    const saved = writeCaptionDraft(browserStorage(), key, state.base, next);
    setState({ ...next, unavailable: !saved });
  };
  const discard = () => {
    const removed = clear();
    setState({ key, base, ...base, recovered: false, conflict: null, unavailable: !removed });
  };
  return { ...state, setCaption: (value) => change('caption', value),
    setShort: (value) => change('short', value), clear, restore, discard };
}
