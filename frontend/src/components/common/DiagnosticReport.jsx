import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../api/fetchClient'
import { useToast } from './Toast'
import { formatDiagnostic } from './diagnosticFormat'
import { copyText } from '../../utils/copyText'

export { formatDiagnostic }

export default function DiagnosticReport() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // Set only when the report was BUILT and the clipboard refused it. Without
  // this the report was assembled, copied nowhere and thrown away, and the
  // toast blamed the build step that had already succeeded.
  const [fallback, setFallback] = useState(null)
  const box = useRef(null)

  useEffect(() => {
    if (fallback && box.current) { box.current.focus(); box.current.select() }
  }, [fallback])

  const copy = async () => {
    setBusy(true)
    setFallback(null)
    let text
    try {
      text = formatDiagnostic(await apiFetch('/api/diagnostic'))
    } catch (err) {
      toast.error(`Could not build the report: ${err.message}`)
      setBusy(false)
      return
    }
    const out = await copyText(text)
    if (out.ok) toast.success('Diagnostic report copied — paste it into your bug report.')
    else {
      setFallback(text)
      toast.error(`The report is ready, but ${out.reason}. Copy it from the box below.`)
    }
    setBusy(false)
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-medium text-content">One-click bug report</p>
      <p className="mt-1 text-xs text-content-muted">
        Copies version, environment health (Python/Pillow/disk), per-engine status with the
        exact missing Klein assets, live ComfyUI GPU/VRAM/queue, the last generation failures
        and the last error tracebacks — no API keys, no folder paths (your home dir is redacted
        to ~). The log/error lines can still mention file names: skim before posting.
      </p>
      <button type="button" onClick={copy} disabled={busy}
        className="mt-3 rounded-md bg-gradient-primary px-3 py-1.5 text-sm font-semibold text-gray-950 disabled:opacity-50">
        {busy ? 'Building…' : '📋 Copy diagnostic report'}
      </button>
      {fallback && (
        <div className="mt-3">
          <p className="text-xs text-content-muted">
            The report was built — your browser would not write to the clipboard. Select it all
            (Ctrl/Cmd+A) and copy by hand.
          </p>
          <textarea ref={box} readOnly value={fallback} rows={10} spellCheck={false}
            onFocus={(e) => e.target.select()}
            className="mt-2 w-full resize-y rounded-md border border-border bg-app/60 p-2 font-mono text-[11px] text-content" />
          <button type="button" onClick={() => setFallback(null)}
            className="mt-2 text-xs text-content-muted underline">Hide</button>
        </div>
      )}
    </div>
  )
}
