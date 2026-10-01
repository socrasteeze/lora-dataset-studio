import { useEffect, useState } from 'react'
import { postJson } from '../../api/fetchClient'
import { btnShape, fieldClass } from '../common/controls'

/* A single-line field stands at the shared control height (common/controls.js):
   40 px to a finger, 32 px on a desktop, so a Test, Show or Refresh button
   beside it lines up. Plugins reuse this class on multi-line fields, which
   must keep growing with their rows, so a textarea releases that height. */
export const INPUT_CLASS =
  `mt-1 w-full ${fieldClass()} border-border-strong bg-surface-raised ` +
  'placeholder:text-content-subtle focus:border-primary focus:outline-none ' +
  '[&:is(textarea)]:h-auto [&:is(textarea)]:min-h-0 [&:is(textarea)]:py-2'

/* The outlined button that sits beside a settings field (Test, Show, Refresh,
   Check folder): the same height as INPUT_CLASS. */
export const SIDE_BUTTON_CLASS =
  `${btnShape()} border border-border-strong font-medium text-content hover:bg-surface-raised`

/* Section heading: a small mono "rack tag" eyebrow above the title keeps every
   settings/guide section labeled the same way without shouting. */
export function SectionHeader({ eyebrow, title, description, badge }) {
  return (
    <div>
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-content-subtle">{eyebrow}</p>
      <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-content">
        {title}{badge}
      </h1>
      {description && <p className="mt-1 text-sm text-content-muted">{description}</p>}
    </div>
  )
}

// Status is never color-only: an explicit glyph + text label carries the
// meaning, color is a reinforcing cue on top.
export function StatusBadge({ ok, okLabel = 'Configured', missingLabel = 'Not set' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${ok ? 'text-emerald-400' : 'text-content-subtle'}`}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span>
      {ok ? okLabel : missingLabel}
    </span>
  )
}

export function TestResult({ result }) {
  if (!result) return null
  const level = result.severity === 'warning' || result.code === 'broad_access'
    ? 'warning'
    : result.ok ? 'success' : 'error'
  const presentation = {
    success: { glyph: '\u2713', label: 'Success', className: 'text-emerald-400' },
    warning: { glyph: '\u26A0', label: 'Warning', className: 'text-amber-400' },
    error: { glyph: '\u2717', label: 'Error', className: 'text-rose-400' },
  }[level]
  const detail = level === 'warning' ? (result.warning || result.detail) : result.detail
  return (
    <p role={level === 'error' ? 'alert' : 'status'} aria-live="polite"
      className={`text-xs ${presentation.className}`}>
      <span aria-hidden="true">{presentation.glyph}</span>{' '}
      <span className="sr-only">{presentation.label}: </span>{detail}
    </p>
  )
}

export function TestButton({ target, onResult, beforeTest }) {
  const pluginId = useContext(SettingsScopeContext)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      // Secret fields pass beforeTest to persist the value still sitting in the
      // write-only input: the probe reads the SAVED key, so testing an unsaved
      // paste would always answer "key missing".
      if (beforeTest) await beforeTest()
      onResult(await postJson(settingsApiUrl(pluginId, `/api/settings/test/${encodeURIComponent(target)}`), {}))
    } catch (e) {
      onResult({ ok: false, detail: e.message || 'Test failed' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={`${SIDE_BUTTON_CLASS} shrink-0`}
    >
      {busy ? 'Testing' : 'Test'}
    </button>
  )
}

export function Card({ title, help, children, id }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-content">{title}</h2>
      {help && <p className="mt-1 text-sm text-content-muted">{help}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/* `warn` (optional): an amber note UNDER the input, for a value that saves fine but
   will not work — a folder that isn't on disk, say. Distinct from `help` (above the
   input, always-on guidance) so a real problem can't read as documentation.
   `children` renders after it, for a field that needs its own action button. */
export function TextField({ id, label, value, onChange, placeholder, help, warn, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-content">{label}</label>
      {help && <p className="mb-1 text-xs text-content-muted">{help}</p>}
      <input
        id={id}
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      {warn && (
        <p className="mt-1 break-words text-xs text-amber-400">
          <span aria-hidden="true">⚠</span> {warn}
        </p>
      )}
      {children}
    </div>
  )
}

/* One saved-secret row: write-only password input + presence badge + optional
   Test (persists the pending paste first) + Remove. `field` comes from a
   SECRET_FIELDS-style descriptor: { key, label, testTarget, help, guide? }. */
export function SecretField({
  field, secretsPresence, secretInputs, setSecretInputs,
  testResults, recordTestResult, saveSecretIfPending, handleDeleteSecret,
}) {
  const f = field
  const [visible, setVisible] = useState(false)
  useEffect(() => { if (!secretInputs[f.key]) setVisible(false) }, [secretInputs, f.key])
  return (
    // flex-wrap + a full-width first child under `sm`: on a phone the Test and
    // Remove buttons drop to their own line instead of squeezing the key input
    // down to a few characters. From `sm` up it is the historical single row.
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div className="w-full sm:w-auto sm:flex-1">
        <div className="flex items-center justify-between">
          <label htmlFor={f.key} className="block text-sm font-medium text-content">{f.label}</label>
          <StatusBadge ok={!!secretsPresence[f.key]} />
        </div>
        <p className="mb-1 text-xs text-content-muted">{f.help}</p>
        {f.guide}
        {/* items-end: the input's mt-1 must not push it below the button. */}
        <div className="flex items-end gap-2">
        <input
          id={f.key}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          value={secretInputs[f.key] ?? ''}
          onChange={(e) => setSecretInputs((prev) => ({ ...prev, [f.key]: e.target.value }))}
          placeholder={secretsPresence[f.key] ? 'Already set — enter a new value to replace it' : 'Not set'}
          className={`${INPUT_CLASS} min-w-0`}
        />
        <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${f.label}`}
          aria-pressed={visible} onClick={() => setVisible((value) => !value)}
          disabled={!secretInputs[f.key]}
          className={`${btnShape({ noShrink: true })} border border-border text-content`}>
          {visible ? 'Hide' : 'Show'}
        </button>
        </div>
        {f.testTarget && <TestResult result={testResults[f.testTarget]} />}
      </div>
      {f.testTarget && (
        <TestButton target={f.testTarget} beforeTest={() => saveSecretIfPending(f.key)}
          onResult={(r) => recordTestResult(f.testTarget, r)} />
      )}
      {secretsPresence[f.key] && (
        <button
          type="button"
          onClick={() => handleDeleteSecret(f.key, f.label)}
          title={`Remove the saved ${f.label}`}
          className={`${btnShape({ noShrink: true })} border border-rose-500/40 font-medium text-rose-300 hover:bg-rose-500/10`}
        >
          Remove
        </button>
      )}
    </div>
  )
}
import { useContext } from 'react'
import { SettingsScopeContext } from './settingsScope.js'
import { settingsApiUrl } from '../../pages/pluginSettings.js'
