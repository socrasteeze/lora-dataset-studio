/**
 * One image in the Bank grid.
 *
 * Moved out of BankWorkspace.jsx by the Encre redesign: in structure B the grid
 * is the CENTRE of the screen and full height, so the tile stopped being an
 * incidental detail of a four-zone stack and became the thing the page is for.
 *
 * Nothing about its behaviour changed — same three hit targets (select, ▶
 * review, ⛶ open), same badge cluster, same tooltip. Since then the badge
 * cluster is capped at three plus "+n" (bankTileBadges.js), the actions are
 * finger-sized on touch, and the caption author shows as a chip.
 */
import { STATUS_RING } from './bankFacets.js'
import SelectionMark from '../shared/SelectionMark';
import { Tag } from 'lucide-react';
import { editBadge, imageVersionQuery } from './bankEdits.js'
import { detailSummary } from './bankProvenance.js'
import { captionChips } from './bankTags.js'
import { capTileBadges, tileBadges } from './bankTileBadges.js'
import { captionIsAsserted, captionOriginInfo, captionOriginTooltipLine } from '../../utils/captionOrigin.js'

export default function Tile({ img, bankId, selected, onToggle, onReview, onTags }) {
  // The chips this image would actually offer. Computed HERE rather than asked of
  // the caption's mere existence: a caption of nothing but stop words ("a photo of
  // her") yields zero chips, and `img.caption && …` would have offered the button
  // anyway. The test for "can this button do its job" is the job's own output.
  const tagChips = captionChips(img.caption)
  // ✂/✨ made in the Bank itself. A state, like ✓ ✕ ⬆ and the flags — it belongs
  // in the readout cluster, not among the actions.
  const edited = editBadge(img)
  // At most three badges and a "+n" (bankTileBadges.js): on a phone the full
  // stack covered most of the picture.
  const { shown, more } = capTileBadges(tileBadges(img, edited))
  const badge = (b) => (
    <span key={b.key} title={b.title} aria-label={b.label}
      className={`rounded px-1 py-px text-2xs font-semibold leading-none ${b.cls}`}>{b.text}</span>
  )
  // Who wrote the caption, said on the tile the way the Dataset tile says it —
  // not only in the hover tooltip, which a phone never shows. Same helper, same
  // silence when the author was never recorded.
  const origin = (img.caption || '').trim() ? captionOriginInfo(img.caption_origin) : null
  return (
    <li className={`relative overflow-hidden rounded-lg border border-border bg-surface ${STATUS_RING[img.status] || ''}`}>
      <button type="button" onClick={onToggle}
        title={`${img.name} — ${img.width || '?'}×${img.height || '?'}`
          + (img.blur_score != null ? ` · sharpness ${Math.round(img.blur_score)}` : '')
          + (img.aesthetic_score != null ? ` · aesthetic ${img.aesthetic_score.toFixed(1)}` : '')
          + (img.nsfw_score != null ? ` · NSFW ${Math.round(img.nsfw_score * 100)}%` : '')
          + (img.face_cluster ? ` · person #${img.face_cluster}`
            // A declaration is not a measurement — the tooltip says which it is.
            + (img.face_cluster_origin === 'asserted' ? ' (your folder assertion)' : '') : '')
          + (img.framing ? ` · ${img.framing}` : '')
          + (img.medium ? ` · ${img.medium}` : '')
          + (img.face_yaw != null ? ` · head turned ${Math.round(Math.abs(img.face_yaw))}°` : '')
          + (detailSummary(img)?.soft ? ` · only ~${detailSummary(img).real} px of real detail` : '')
          + (img.origin && img.origin !== 'unknown' ? ` · ${img.origin}` : '')
          + (img.style_cluster ? ` · style #${img.style_cluster}` : '')
          + (img.semantic_dup_group ? ` · same shot #${img.semantic_dup_group}` : '')
          // The caption, and WHO WROTE IT in the same breath. The 'auto' backend
          // chains two engines inside one run, so a bank holds both and the
          // sentence alone cannot say which half produced it — exactly the reading
          // this tooltip was missing.
          + (img.caption
            ? `\n${captionOriginTooltipLine(img.caption, img.caption_origin)}: ${img.caption}`
            : '')}
        className="block aspect-[3/4] w-full">
        {/* ?r=/?e= are cache busters, not parameters the server reads: the thumb
            route answers with max-age=3600, so a turned OR edited image would keep
            showing its old pixels for an hour and read as "the button did nothing".
            ?e= carries the edit GENERATION, so a second crop of the same image
            moves the URL too — see bankEdits.imageVersionQuery.
            3:4 portrait: bank photos are typically people, and a short
            landscape crop cut the body off. Width comes from the grid; S vs M
            is column count, not a second height. Landscape shots stay
            centre-cropped (object-cover), not squashed. */}
        <img src={`/api/bank/${bankId}/thumb/${img.id}${imageVersionQuery(img)}`}
          alt={[img.name, img.rotation ? `rotated ${img.rotation}°` : null,
            edited ? edited.label : null].filter(Boolean).join(' — ')} loading="lazy"
          className="h-full w-full object-cover" />
      </button>
      {selected && (
        <>
          {/* The ring marks the FRAME; nothing is laid over the picture. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-primary" />
          <SelectionMark />
        </>
      )}
      <span className="absolute left-1 top-1 flex flex-wrap gap-0.5 max-w-[85%]">
        {shown.map(badge)}
        {more && badge(more)}
      </span>
      {origin?.known && (
        <span title={origin.title} aria-label={origin.short}
          className={`bank-tile__origin truncate rounded bg-black/60 px-1 py-px text-2xs leading-none ${
            captionIsAsserted(img.caption_origin) ? 'text-emerald-300' : 'text-white/80'}`}>
          {origin.chip}
        </span>
      )}
      {/* ▶ starts the fast-triage lightbox AT this image. It's a separate hit
          target on purpose: the tile's own click still (de)selects for the bulk
          ✓/✕/⬆ bar, so neither use loses its gesture. */}
      {/* 🏷️ MOVED HERE, out of the badge cluster in the top-left corner.
          Everything up there is a STATE READOUT — ✓, ✕, ⬆, the flags, the person
          and framing chips — and none of it is clickable. A button dropped in the
          middle of that row does not read as an action; in the maintainer's own
          words, "otherwise it gets drowned at the top with the icons that aren't
          clickable". The tile's two real actions live in this bottom-right group,
          so the third one joins them, in the same clothes.

          AND IT ONLY APPEARS WHEN IT CAN DELIVER. The chips ARE the words of the
          caption, so on an image whose caption yields none the picker could only
          say "This caption has no word worth filtering on." — a button promising
          something it cannot do. That silence has already cost once, the other way
          round: the feature had shipped for two days and was read as absent,
          because the bank simply had no captions. So the button says WHY it is
          not there, exactly the way a semantic action names its missing index
          on the pass row — a shipped feature that says nothing is indistinguishable
          from one that does not exist. */}
      {/* FINGER-SIZED, SAME AS THE DATASET TILE. Each action is a transparent
          hit area around the small pill a desktop shows. Below lg or on a
          coarse pointer the three share one 40 px strip across the tile foot
          (index.css, .bank-tile__actions); a desktop mouse keeps the corner
          cluster. */}
      <div className="bank-tile__actions">
        {tagChips.length > 0 ? (
          <button type="button" onClick={onTags}
            title={`Filter the bank by this image's tags — ${img.caption}`}
            aria-label={`Use the tags of ${img.name} as a filter`}
            className="bank-tile__action group/act">
            <span className="inline-flex rounded bg-black/60 px-1 py-px text-2xs text-emerald-200 group-hover/act:bg-black/80"><Tag aria-hidden="true" className="h-3 w-3" /></span>
          </button>
        ) : (
          <span
            title={img.caption
              ? 'Tags — this caption has no word worth filtering on (the chips are the caption\'s own words)'
              : 'Tags (needs a caption) — run Caption on this bank and the chips appear here'}
            aria-label={img.caption
              ? 'Tags unavailable: this caption has no word worth filtering on'
              : 'Tags unavailable: this image has no caption yet'}
            className="bank-tile__action">
            <span className="inline-flex rounded bg-black/40 px-1 py-px text-2xs text-white/35"><Tag aria-hidden="true" className="h-3 w-3" /></span>
          </span>
        )}
        <button type="button" onClick={onReview}
          title="Review from this image — full size, one at a time, with Keep/Reject/Skip"
          aria-label={`Review from ${img.name}`}
          className="bank-tile__action group/act">
          <span className="rounded bg-black/60 px-1 text-2xs text-white group-hover/act:bg-black/80">▶</span>
        </button>
        {/* ⛶ serves what the bank RESOLVES for this image, and on an edited row that
            is the crop/upscale — so the tooltip stops calling it "the original file",
            which a ✂ crop makes visibly false, and the version key travels with it
            (this route is cached too). Renamed rather than made conditional: a
            computed title is invisible to the surface-inventory guard, and this
            button is worth keeping under it. */}
        <a href={`/api/bank/${bankId}/file/${img.id}${imageVersionQuery(img)}`}
          target="_blank" rel="noreferrer"
          title="Open this image full size, as the Bank shows it — your own file on disk is never modified"
          aria-label={`Open ${img.name} full size`}
          className="bank-tile__action group/act no-underline">
          <span className="rounded bg-black/60 px-1 text-2xs text-white group-hover/act:bg-black/80">⛶</span>
        </a>
      </div>
    </li>
  )
}
