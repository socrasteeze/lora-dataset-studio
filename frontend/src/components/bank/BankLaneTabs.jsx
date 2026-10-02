import { NavLink } from 'react-router'
import { Images } from 'lucide-react'
import PluginSlot from '../../plugins/PluginSlot.jsx'

export const laneTabClass = ({ isActive }) => [
    'inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-semibold no-underline transition-colors lg:min-h-0',
    isActive
      ? 'border-primary/60 bg-primary/15 text-content'
      : 'border-border bg-surface text-content-muted hover:bg-surface-raised hover:text-content',
  ].join(' ')

export default function BankLaneTabs({ className = '', surface = 'bank' }) {
  return (
    <div role="group" aria-label="Kind of bank" className={`flex flex-nowrap items-stretch gap-1.5 ${className}`}>
      <NavLink to="/bank" end className={laneTabClass}>
        <Images aria-hidden="true" className="h-3.5 w-3.5" /> Images
      </NavLink>
      <PluginSlot slot="lanes" surface={surface} />
    </div>
  )
}
