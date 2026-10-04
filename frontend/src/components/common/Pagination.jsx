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
    <div className="grid grid-cols-2 items-center gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:flex lg:flex-wrap lg:pb-0">
      <div className="min-w-0 text-sm lg:contents">
        <span className="block text-content-muted lg:inline">{rangeStart}–{rangeEnd} of {total}</span>
        <span className="block text-content lg:inline">page {page} of {pages}</span>
      </div>
      <Button size="md" className="row-start-2 min-w-0 w-full lg:w-auto" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button size="md" className="row-start-2 min-w-0 w-full lg:w-auto" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      <Select
        size="md"
        className="col-start-2 row-start-1 min-w-0 w-full lg:w-auto"
        aria-label={label}
        value={pageSize}
        onChange={(e) => onPageSize(Number(e.target.value))}
      >
        {LIBRARY_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
    </div>
  )
}
