/**
 * 🏷️ The caption tags of the current SELECTION, as filter chips.
 *
 * Moved out of BankWorkspace.jsx by the Encre redesign. In structure B it has
 * ONE mount instead of two: it lives at the foot of the filter rail, with every
 * other way of narrowing the grid. The old screen mounted it twice — once in the
 * filter zone for phones, once as a sticky desktop inspector — and hid one of
 * them with `xl:hidden`. The rail is the responsive answer to the same problem,
 * so the duplicate mount is gone rather than carried over.
 *
 * The counting itself is unit-tested in bankTags.test.js; this file only renders.
 */
import { Chip, GroupLabel } from './BankAtoms.jsx'
import { Button } from '../common/Controls.jsx'
import { selectionTagsNotes, tagCountLabel, tagFilterSummary } from './bankTags.js'

export default function SelectionTagsPanel({ tagRow, tagPicked, onToggle, onClear }) {
  return (
    <div className="space-y-2 rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-2.5 py-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <GroupLabel>🏷️ Caption Tags</GroupLabel>
          <p className="m-0 truncate text-2xs text-content-subtle"
            title={tagRow.kind === 'image' ? tagRow.name : undefined}>
            {tagRow.kind === 'image' ? tagRow.name
              : `${tagRow.size} selected ${tagRow.size === 1 ? 'image' : 'images'}`}
          </p>
        </div>
        <Button type="button" size="sm" noShrink onClick={onClear}>
          ✕ Close
        </Button>
      </div>
      {tagRow.frozen && (
        <p className="m-0 text-2xs text-content-subtle">
          Held from the selection you filtered on.
        </p>
      )}
      {tagRow.rows.length === 0 ? (
        !(tagRow.uncaptioned > 0 && tagRow.counted === 0) && (
          <p className="m-0 text-xs leading-snug text-content-muted">
            No caption here has a word worth filtering on.
          </p>
        )
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tagRow.rows.map(({ tag, count }) => {
            const n = tagCountLabel(count, tagRow.counted)
            return (
              <Chip key={tag} active={tagPicked.has(tag)}
                onClick={() => onToggle(tag)}
                title={tagPicked.has(tag)
                  ? `Stop requiring “${tag}”`
                  : `Show only images whose caption mentions “${tag}”`
                    + (n ? ` — cited by ${count} of the ${tagRow.counted} captioned images you selected` : '')}>
                {tag}
                {n && <span className="ml-1 text-2xs text-content-subtle">{n}</span>}
              </Chip>
            )
          })}
        </div>
      )}
      {selectionTagsNotes(tagRow, tagRow.unread).map((note) => (
        <p key={note} className={`m-0 leading-snug ${tagRow.rows.length === 0
          ? 'text-xs text-content-muted' : 'text-2xs text-content-subtle'}`}>{note}</p>
      ))}
      {tagPicked.size > 0 && (
        <p className="m-0 text-2xs text-content-muted">
          {tagFilterSummary(tagPicked)} Matched as whole words, in captions and file names.
        </p>
      )}
    </div>
  )
}
