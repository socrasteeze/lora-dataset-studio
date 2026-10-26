import { useEffect, useState } from 'react'
import { Input, btnShape } from './Controls.jsx'

/** Reveal only the current field value. Empty fields return to masked mode. */
export default function PasswordInput({ label = 'Credential', value, disabled, size = 'md', className = '', ...props }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { if (!value) setVisible(false) }, [value])
  return <div className="flex min-w-0 flex-1 items-end gap-2">
    <Input {...props} className={`min-w-0 flex-1 ${className}`} size={size} type={visible ? 'text' : 'password'} value={value} disabled={disabled} />
    <button type="button" disabled={disabled || !value} aria-pressed={visible}
      aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
      onClick={() => setVisible((current) => !current)}
      className={`${btnShape({ size, noShrink: true })} border border-border text-content hover:bg-surface-raised`}>
      {visible ? 'Hide' : 'Show'}
    </button>
  </div>
}
