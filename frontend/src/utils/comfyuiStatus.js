/* Why ComfyUI isn't answering — ONE sentence per cause, for every screen.
   PURE JS (no JSX) so `node --test` can exercise it directly.

   WHY THIS FILE EXISTS
   --------------------
   Every local-engine surface used to answer "⚠ Configure ComfyUI in Settings"
   the moment `caps.comfyui.reachable` was false. That is one sentence for two
   very different situations, and it is wrong in one of them:

     * ComfyUI is not running (or the URL is wrong) → start it / fix the URL.
     * ComfyUI IS running and simply took too long to enumerate its nodes and
       model files → give it more time.

   The second is not hypothetical: it is what j_o_e_l. hit on Discord, on a
   ComfyUI that was up. The `/object_info` payload grows with every custom-node
   pack and every weight installed, so the richer the install, the more likely it
   blows a fixed budget — and he was told to go and check that ComfyUI was
   started, which it was. "Configure ComfyUI in Settings" sends that user to
   re-check the one thing that was already correct.

   So the reason is computed from `caps.comfyui.status` ('ok' | 'slow' |
   'unreachable' | 'unconfigured' | 'ignored'), which the backend publishes alongside
   `reachable`, and the wording lives here rather than in each card. */

/** Whether ComfyUI is answering at all — the gate every engine card shares.
 *  Reads `status` when the server publishes it and falls back to `reachable`,
 *  so a front running against an older backend keeps working. */
export function comfyuiAnswering(comfy) {
  const c = comfy || {};
  if (typeof c.status === 'string') return c.status === 'ok';
  return !!c.reachable;
}

/** True when the server reports ComfyUI as ignored in Settings (`comfyui.ignored`):
 *  LDS made no request, so the right display is a neutral "Ignored", not an error. */
export function comfyuiIgnored(comfy) {
  const c = comfy || {};
  return c.ignored === true || c.status === 'ignored';
}

/** The ONE sentence for a ComfyUI that isn't answering, or null when it is.
 *
 *  The server sends its own `hint` (the same words the blocked-run 409 uses, so
 *  a user who sees both reads one message, not two). This function prefers it
 *  and only composes a fallback for older/absent payloads — that fallback still
 *  has to distinguish the two causes, because a front that collapses them
 *  re-creates the bug on its own. */
export function comfyuiDownReason(comfy) {
  const c = comfy || {};
  if (comfyuiAnswering(c)) return null;
  // The operator's own choice (`comfyui.ignored`), not a fault: neutral, no ⚠.
  if (comfyuiIgnored(c)) return 'ComfyUI is set to Ignore in Settings ▸ Local tools';
  if (c.hint) return `⚠ ${c.hint}`;
  if (c.status === 'slow') {
    const secs = Number(c.object_info_timeout_s) || 0;
    return `⚠ ComfyUI is running but took more than ${secs || 'the allowed'}`
      + `${secs ? 's' : ' time'} to list its nodes — raise "ComfyUI response timeout"`
      + ' in Settings ▸ Local tools ▸ ComfyUI';
  }
  return '⚠ Configure ComfyUI in Settings';
}
