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

/** Copy `text`. Never throws.
 *  @returns {Promise<{ok: true} | {ok: false, reason: string}>} */
export async function copyText(text, env = globalThis) {
  const unavailable = clipboardUnavailableReason(env);
  if (unavailable) return { ok: false, reason: unavailable };
  try {
    await env.navigator.clipboard.writeText(String(text ?? ''));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: writeFailureReason(err) };
  }
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
