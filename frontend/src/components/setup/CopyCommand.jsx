import { useState } from 'react'
import { copyText } from '../../utils/copyText'

export default function CopyCommand({ command }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const copy = async () => {
    const res = await copyText(command)
    // A refusal is said on the button; the command is visible to copy by hand.
    if (res.ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    else { setFailed(true); setTimeout(() => setFailed(false), 2500) }
  }
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] text-content">
        {command}
      </code>
      <button type="button" onClick={copy}
        className="shrink-0 rounded-md border border-border-strong px-2 py-1 text-[11px] text-content hover:bg-surface-raised">
        {copied ? 'Copied' : failed ? 'Copy failed' : 'Copy'}
      </button>
    </div>
  )
}
