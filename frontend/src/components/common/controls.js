/* One control system for buttons, selects and inputs, so a row of them lines up.
 *
 * A desktop (`lg` and up) gets a fixed height per size: sm 28 px (rails,
 * toolbars, chips), md 32 px (the default), lg 36 px (a page's main action).
 * Below `lg` every control keeps the repository's 40-px finger target
 * (`min-h-10`), which `lg:min-h-0` releases on a desktop.
 *
 * Buttons are `inline-flex`: Tailwind's preflight makes an <svg> a block, so an
 * icon in a plain button sits ABOVE its label and doubles the height (the Train
 * and Liked buttons, measured at 48 and 42 px beside 26-px neighbours).
 *
 * These are class strings, not only components, because most call sites
 * already assemble their className. Every class is written out whole: Tailwind
 * finds classes by scanning source text, and a class assembled from pieces
 * would never reach the stylesheet.
 */

const HEIGHT = {
  sm: 'min-h-10 lg:min-h-0 lg:h-7',
  md: 'min-h-10 lg:min-h-0 lg:h-8',
  lg: 'min-h-10 lg:min-h-0 lg:h-9',
}

const BTN_LAYOUT = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-colors disabled:opacity-40'

const BTN_SIZE = {
  sm: 'px-2.5 text-xs',
  md: 'px-3 text-sm',
  lg: 'px-4 text-sm font-semibold',
}

const BTN_VARIANT = {
  primary: 'bg-gradient-primary text-gray-950 font-semibold',
  secondary: 'border border-border bg-surface text-content hover:bg-surface-raised',
  danger: 'bg-red-600/80 text-white font-semibold hover:bg-red-600',
  ghost: 'text-content-muted hover:text-content hover:bg-surface-raised',
}

const FIELD_SIZE = {
  sm: 'px-2 py-0 text-xs',
  md: 'px-2 py-0 text-sm',
}

const FIELD_LOOK = 'rounded-md border border-border bg-surface text-content disabled:opacity-50'

function pick(table, key, what) {
  const value = table[key]
  if (value === undefined) throw new Error(`controls: unknown ${what} "${key}"`)
  return value
}

/** The height classes alone, for anything that must sit level with a control:
 *  a badge, a link, a segmented group, a component that owns its own colours. */
export function controlHeight(size = 'md') {
  return pick(HEIGHT, size, 'size')
}

/** Layout, height, padding and type size of a button, without colours. For a
 *  button whose colours carry state (a pressed chip, a toggle). `noShrink`
 *  adds `shrink-0`, for a row that scrolls sideways instead of wrapping. */
export function btnShape({ size = 'md', noShrink = false } = {}) {
  const shape = `${BTN_LAYOUT} ${controlHeight(size)} ${pick(BTN_SIZE, size, 'size')}`
  return noShrink ? `${shape} shrink-0` : shape
}

/** A complete button: `btnShape` plus the colours of one variant. */
export function btnClass({ variant = 'secondary', size = 'md', noShrink = false } = {}) {
  return `${btnShape({ size, noShrink })} ${pick(BTN_VARIANT, variant, 'variant')}`
}

/** A single-line input or select at a control height: md by default, sm in a
 *  dense row. A button beside it takes the same size. */
export function fieldClass({ size = 'md' } = {}) {
  return `${controlHeight(size)} ${pick(FIELD_SIZE, size, 'field size')} ${FIELD_LOOK}`
}
