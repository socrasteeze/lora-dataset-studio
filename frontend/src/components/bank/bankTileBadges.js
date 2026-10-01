/* The Bank tile's badge stack: what it says, in what order, and how much of it.
 *
 * PURE JS so `node --test` drives it. BankTile.jsx renders what this returns.
 *
 * Three fixes live here, all from the same complaint (a phone grid where the
 * badges said too little and covered too much):
 *
 *  - A rejected tile printed its reason as the raw id ("✕ low_aesthetic").
 *    It now reads the same words as the ✕ Why chips, through reasonLabel().
 *  - Flags were cut to two letters, so Blurry and Black bars both read "Bl".
 *    Each flag has its own short word (FLAG_SHORT); the full name rides on
 *    the badge's title and aria-label.
 *  - On a 104 px tile a busy image stacked eight badges over most of the
 *    picture. The stack now shows at most TILE_BADGE_LIMIT, then "+n", whose
 *    title names the rest. Order is unchanged, so the decision (✓/✕) and the
 *    promotion (⬆) always survive the cut.
 */
import { FLAG_LABEL, flagShortLabel } from './bankFacets.js'
import { angleBadge, angleTitle } from './bankMedium.js'
import { reasonLabel } from './bankRejectReasons.js'

export const TILE_BADGE_LIMIT = 3

const DARK = 'bg-black/60'

/** Every badge the image earns, in display order:
 *  [{ key, text, cls, title, label }]. `label` is the accessible name. */
export function tileBadges(img, edited = null) {
  const out = []
  const add = (key, text, cls, title = text, label = title) =>
    out.push({ key, text, cls, title, label })
  if (img.status === 'keep') add('keep', '✓', 'bg-emerald-500/80 text-white', 'Kept')
  if (img.status === 'reject') {
    const why = img.reject_reason ? reasonLabel(img.reject_reason, FLAG_LABEL) : ''
    add('reject', `✕ ${why}`.trim(), 'bg-rose-500/80 text-white',
      why ? `Rejected: ${why}` : 'Rejected')
  }
  // ⬆ = this image left for somewhere: a dataset, another bank, or both. One
  // badge for both destinations; the review lightbox says where.
  if (img.promoted_dataset_id != null || img.promoted_bank_id != null) {
    add('promoted', '⬆', 'bg-indigo-500/80 text-white', 'Promoted')
  }
  // ✂/✨ = these pixels were edited HERE. The title carries the promise the
  // feature rests on: your own file was not touched.
  if (edited) add('edited', edited.text, 'bg-sky-500/80 text-white', edited.title, edited.label)
  for (const f of img.flags || []) {
    add(`flag:${f}`, flagShortLabel(f), `${DARK} text-amber-200`, FLAG_LABEL[f] || f)
  }
  if (img.face_cluster != null) add('person', `person ${img.face_cluster}`, `${DARK} text-sky-200`)
  if (img.framing) add('framing', `${img.framing}`, `${DARK} text-teal-200`)
  // Only a COMMITTED medium: 'unsure' is a real verdict but not a label to
  // write on a thumbnail, and NULL means the pass never reached this image.
  if (img.medium && img.medium !== 'unsure') add('medium', `${img.medium}`, `${DARK} text-lime-200`)
  const angle = angleBadge(img)
  if (angle) {
    const name = `Head angle: ${angle.id.replace('_', ' ')}`
    add('angle', angle.text, `${DARK} text-cyan-200`, angleTitle(angle.id) || name, name)
  }
  // Only the PROVEN origins. Stamping ❔ on the 80% of files whose metadata was
  // stripped would be noise, not information.
  if (img.origin === 'ai') add('origin', 'AI', `${DARK} text-violet-200`, 'AI-generated')
  if (img.origin === 'camera') add('origin', 'photo', `${DARK} text-emerald-200`, 'Camera photo')
  if (img.style_cluster != null) add('style', `style ${img.style_cluster}`, `${DARK} text-fuchsia-200`)
  if (img.dup_group != null) {
    add('dup', `≈${img.dup_group}`, `${DARK} text-fuchsia-200`, `Duplicate group ${img.dup_group}`)
  }
  if (img.semantic_dup_group != null) {
    add('semantic', `✂${img.semantic_dup_group}`, `${DARK} text-orange-200`,
      `Same shot group ${img.semantic_dup_group}`)
  }
  return out
}

/** The first `limit` badges, plus a "+n" badge naming the rest (or null). */
export function capTileBadges(badges, limit = TILE_BADGE_LIMIT) {
  if (badges.length <= limit) return { shown: badges, more: null }
  const rest = badges.slice(limit)
  // `label`, not `title`: an edit badge's title is a whole sentence.
  const names = rest.map((b) => b.label).join(', ')
  return {
    shown: badges.slice(0, limit),
    more: {
      key: 'more', text: `+${rest.length}`, cls: `${DARK} text-white`,
      title: names, label: `${rest.length} more: ${names}`,
    },
  }
}
