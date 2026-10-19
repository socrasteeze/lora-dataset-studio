import { sourceName, sourceLink, sourceTags } from '../shared/imageSources.js'

export default function ImageSourceAttribution({ metadata, className = '' }) {
  const link = sourceLink(metadata)
  if (!link) return null
  const tags = sourceTags(metadata)
  return <details className={`min-w-0 text-xs ${className}`}>
    <summary className="flex min-h-10 cursor-pointer items-center">{sourceName(metadata.platform)} Source</summary>
    <a className="flex min-h-10 items-center underline" href={link} target="_blank" rel="noopener noreferrer">Original Post</a>
    {tags.length > 0 && <p className="break-words text-2xs text-content-muted">{tags.join(', ')}</p>}
  </details>
}
