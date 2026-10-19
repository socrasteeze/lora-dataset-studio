import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import GeneratedImageLightbox from './GeneratedImageLightbox'

/** Source items use the shared viewer without generated-image or library actions. */
export default function SourceImagePreview({ jobId, items, itemId, onItemChange, onClose }) {
  const index = items.findIndex((item) => item.id === itemId)
  const item = items[index]
  const active = Boolean(item)
  const url = !item ? '' : item.downloaded
    ? `/api/image-sources/jobs/${jobId}/file/${item.id}?inline=1`
    : `/api/image-sources/jobs/${jobId}/preview/${item.id}`
  // Polling the job must not reset focus inside the shared viewer.
  const image = useMemo(() => url ? { url } : null, [url])
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [url])
  useEffect(() => {
    if (!active) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [active])
  if (!item) return null
  return createPortal(
    <div className="[&_button]:min-h-10 [&_button]:min-w-10 lg:[&_button]:min-h-0 lg:[&_button]:min-w-0"
      onErrorCapture={(event) => { if (event.target.tagName === 'IMG') setFailed(true) }}>
      <GeneratedImageLightbox img={image} facts={false} alt={`Source Preview ${index + 1} of ${items.length}`}
        onClose={onClose}
        onPrev={index > 0 ? () => onItemChange(items[index - 1].id) : null}
        onNext={index + 1 < items.length ? () => onItemChange(items[index + 1].id) : null} />
      <div className="pointer-events-none fixed bottom-4 left-3 right-3 z-[9998] text-center text-xs text-white">
        <span className="inline-block max-w-full rounded bg-black/80 px-3 py-2">
          {failed ? <span role="alert">The cached image is unavailable. Close the preview and download it again.</span>
            : <>{index + 1} / {items.length} · {item.downloaded ? 'Original' : 'Thumbnail. Download the original for full detail.'}</>}
        </span>
      </div>
    </div>, document.body,
  )
}
