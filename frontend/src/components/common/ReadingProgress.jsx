import { useEffect, useState } from 'react'

export default function ReadingProgress({ articleRef, chapterId }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    let frame = null
    const measure = () => {
      frame = null
      const article = articleRef.current
      if (!article) return
      const rect = article.getBoundingClientRect()
      const header = document.querySelector('.app-header')?.getBoundingClientRect().bottom || 0
      const distance = rect.height - (window.innerHeight - header)
      setProgress(distance > 0 ? Math.max(0, Math.min(1, (header - rect.top) / distance)) : 1)
    }
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    if (articleRef.current) observer.observe(articleRef.current)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [articleRef, chapterId])
  return <div aria-hidden="true" className="guide-progress pointer-events-none fixed inset-x-0 bottom-0 z-40 h-0.5 bg-surface-raised">
    <div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${progress})` }} />
  </div>
}
