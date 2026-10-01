import { Button, Select } from './Controls.jsx'
import { LIBRARY_PAGE_SIZES } from '../../utils/datasetLibrary.js'

/** Pager under a list. Not chrome: it sits in the page flow so a phone's
 *  fold budget is the header, not this row. */
export default function Pagination({
  page, pages, pageSize, total, rangeStart, rangeEnd, onPage, onPageSize,
  label = 'Items per page',
}) {
  if (!total) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-content-muted">{rangeStart}–{rangeEnd} of {total}</span>
      <span className="text-sm text-content">page {page} of {pages}</span>
      <Button size="md" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button size="md" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      <Select
        size="md"
        aria-label={label}
        value={pageSize}
        onChange={(e) => onPageSize(Number(e.target.value))}
      >
        {LIBRARY_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
    </div>
  )
}
