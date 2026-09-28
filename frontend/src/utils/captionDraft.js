// Local recovery never writes a caption to the server. A draft records the
// server text it was based on so another writer cannot be silently overwritten.
const PREFIX = 'lds:caption-draft:';

export function readCaptionDraft(storage, key, base) {
  if (!key) return { ...base, recovered: false, conflict: null };
  try {
    const raw = storage.getItem(PREFIX + key);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || saved.version !== 1 || typeof saved.caption !== 'string'
        || typeof saved.short !== 'string' || typeof saved.base?.caption !== 'string'
        || typeof saved.base?.short !== 'string') {
      return { ...base, recovered: false, conflict: null };
    }
    if (saved.caption === base.caption && saved.short === base.short) {
      storage.removeItem(PREFIX + key);
      return { ...base, recovered: false, conflict: null };
    }
    const sameBase = saved.base.caption === base.caption && saved.base.short === base.short;
    return sameBase
      ? { caption: saved.caption, short: saved.short, recovered: true, conflict: null }
      : { ...base, recovered: false, conflict: saved };
  } catch {
    return { ...base, recovered: false, conflict: null, unavailable: true };
  }
}

export function writeCaptionDraft(storage, key, base, draft) {
  if (!key) return false;
  try {
    if (draft.caption === base.caption && draft.short === base.short) {
      storage.removeItem(PREFIX + key);
    } else {
      storage.setItem(PREFIX + key, JSON.stringify({ version: 1, base,
        caption: draft.caption, short: draft.short }));
    }
    return true;
  } catch { return false; }
}

export function clearCaptionDraft(storage, key) {
  try { storage.removeItem(PREFIX + key); return true; } catch { return false; }
}
