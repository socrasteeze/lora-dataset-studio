import { Button } from '../common/Controls.jsx'

/** Keep the toolbar in place while background totals arrive or need a retry. */
export default function BankStatsStrip({ children, loading, error, onRetry }) {
  return (
    <div aria-busy={loading && !error}
      className="flex h-10 min-w-0 shrink-0 items-center gap-4 overflow-x-auto overflow-y-hidden whitespace-nowrap text-sm lg:h-8 [scrollbar-width:thin]">
      {error ? <>
        <span role="status" className="text-xs text-amber-200">Stats Unavailable</span>
        <Button type="button" size="sm" noShrink onClick={onRetry}>Retry</Button>
      </> : loading
        ? <span role="status" className="text-xs text-content-subtle">Loading Stats</span>
        : children}
    </div>
  )
}
