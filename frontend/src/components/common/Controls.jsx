/* Thin components over common/controls.js. Call sites that already assemble a
 * className keep using the helpers; these exist so a new row does not invent
 * its own height. */
import { btnClass, btnShape, controlHeight, fieldClass } from './controls.js'

/* Re-exported so a resolver that tries `.jsx` before `.js` (the test loader,
 * on a case-insensitive volume) still finds the helpers on this filename.
 * Vite itself resolves `controls.js` first. */
export { btnClass, btnShape, controlHeight, fieldClass }

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function Button({
  variant = 'secondary',
  size = 'md',
  noShrink = false,
  className,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx(btnClass({ variant, size, noShrink }), className)}
      {...rest}
    />
  )
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  noShrink = false,
  className,
  type = 'button',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(btnClass({ variant, size, noShrink }), className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Input({ size = 'md', className, ...rest }) {
  return <input className={cx(fieldClass({ size }), className)} {...rest} />
}

export function Select({ size = 'md', className, children, ...rest }) {
  return (
    <select className={cx(fieldClass({ size }), className)} {...rest}>
      {children}
    </select>
  )
}

/** A pressed/unpressed choice in a dense rail. Size sm is the rail height. */
export function Chip({
  pressed = false,
  size = 'sm',
  className,
  type = 'button',
  ...rest
}) {
  const look = pressed
    ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
    : 'border-border bg-surface text-content-muted hover:bg-surface-raised'
  return (
    <button
      type={type}
      className={cx(btnShape({ size, noShrink: true }), 'border font-semibold', look, className)}
      {...rest}
      aria-pressed={pressed}
    />
  )
}
