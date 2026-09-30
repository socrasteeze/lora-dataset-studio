/* Copy to the clipboard, and say WHY when it does not work.
 *
 * `navigator.clipboard` does not exist outside a secure context — HTTPS, or a
 * localhost origin. This app is routinely opened on a LAN / Tailscale address
 * over plain HTTP (the launcher prints the bound host:port on purpose), and on
 * that origin every copy button in the app silently does nothing.
 *
 * Most call sites can afford that: their text is already on screen, so the
 * catch comments say "the text is still selectable" and mean it. The
 * diagnostic report could not — it is built on demand, copied nowhere and
 * thrown away, and the toast blamed the BUILD for a clipboard refusal. Hence
 * this helper: it never throws, it returns a reason in the user's words, and
 * it is unit-testable in a way the JSX around it is not.
 *
 * Every copy button goes through here. When the async clipboard API is missing
 * (plain http on a LAN address — an iPhone opening http://<lan-ip>) or rejects,
 * it falls back to the old hidden-textarea + document.execCommand('copy'),
 * which browsers still allow from a click on an insecure origin. Only when that
 * fails too does the caller get `{ok: false, reason}`.
 */

/** Why the clipboard API is unusable on this origin, or null when it looks fine.
 *  Split out from copyText so the reason can be shown BEFORE a click. */
export function clipboardUnavailableReason(env = globalThis) {
  const nav = env?.navigator;
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') return null;
  // isSecureContext is the browser's own verdict; treat "missing" as unknown
  // rather than guessing from the URL (file://, extensions and about: pages all
  // have their own rules).
  if (env?.isSecureContext === false) {
    return 'this page is not on a secure origin — browsers only allow the clipboard on HTTPS or localhost';
  }
  return 'this browser did not offer a clipboard';
}

/** The legacy copy: select a hidden textarea and run execCommand('copy').
 *  Synchronous, never throws, false when there is no DOM or the browser said no. */
export function execCommandCopy(text, env = globalThis) {
  const doc = env?.document;
  if (!doc?.body || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') return false;
  let box = null;
  const previous = doc.activeElement;
  try {
    box = doc.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.setAttribute('aria-hidden', 'true');
    box.tabIndex = -1;
    // Off-screen but still "rendered": display:none cannot be selected. 16px
    // stops iOS zooming the page while the box takes focus.
    box.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;';
    doc.body.appendChild(box);
    box.focus?.({ preventScroll: true });
    box.select();
    box.setSelectionRange?.(0, text.length);   // iOS ignores select() alone
    return doc.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    try { box?.remove(); } catch { /* already gone */ }
    try { previous?.focus?.({ preventScroll: true }); } catch { /* not focusable */ }
  }
}

/** Copy `text`. Never throws.
 *  @returns {Promise<{ok: true} | {ok: false, reason: string}>} */
export async function copyText(text, env = globalThis) {
  const value = String(text ?? '');
  let reason = clipboardUnavailableReason(env);
  if (!reason) {
    try {
      await env.navigator.clipboard.writeText(value);
      return { ok: true };
    } catch (err) {
      reason = writeFailureReason(err);
    }
  }
  // The API is missing or refused: try the legacy path before giving up, and
  // report the API's own reason (it is the one that explains what to change).
  if (execCommandCopy(value, env)) return { ok: true };
  return { ok: false, reason };
}

/** The thrown-error half, in the user's words. Exported for the tests and for
 *  call sites that do their own write. */
export function writeFailureReason(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError') {
    // Either the permission was denied, or the write was not inside a user
    // gesture. Both look identical from here, so say both.
    return 'the browser blocked the clipboard — it only allows a copy directly from a click, and the page must have clipboard permission';
  }
  if (name === 'SecurityError') {
    return 'the browser refused the clipboard on this origin';
  }
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  return msg || 'the browser refused the clipboard without saying why';
}
