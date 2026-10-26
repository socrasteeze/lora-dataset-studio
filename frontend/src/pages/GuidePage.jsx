import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import Markdown, { markdownHeadingId } from '../components/common/Markdown'
import DiagnosticReport from '../components/common/DiagnosticReport'
import { helpTopicsForChapter } from '../help/helpRegistry'
import { guideChapters, plugins } from '../plugins/registry.js'
import { findGuideChapter, guideHeadings } from '../plugins/guideContent.js'
import { buildGuideTextIndex } from '../help/guideTextIndex.js'
import ReadingProgress from '../components/common/ReadingProgress.jsx'
import revisions from 'virtual:guide-revisions'
import { HelpBadge } from '../help/HelpMode'
// Vite inlines every chapter as a string at build time (?raw) → the guide
// lives in the bundle, no fetch, nothing extra to ship in the portable build.
// DATASET_GUIDE.md keeps its historical path (linked from GitHub); the other
// chapters live in docs/guide/.
import gettingStarted from '../../../docs/guide/getting-started.md?raw'
import usingTheApp from '../../../docs/guide/using-the-app.md?raw'
import datasetGuide from '../../../docs/DATASET_GUIDE.md?raw'
import settingsReference from '../../../docs/guide/settings-reference.md?raw'
import troubleshooting from '../../../docs/guide/troubleshooting.md?raw'
import gettingHelp from '../../../docs/guide/getting-help.md?raw'

/* The guide is a true reading sequence — the mono chapter numbers encode the
   intended order, not decoration. `extra` mounts a live component under the
   markdown (the diagnostic button on the help chapter). */
const CHAPTERS = [
  { id: 'getting-started', num: '1', title: 'Getting started', description: 'Install the app, connect the tools you need, and understand the workspace.', source: gettingStarted },
  { id: 'using-the-app', num: '2', title: 'Using the app', description: 'Follow the complete workflow for character, concept, and style datasets.', source: usingTheApp },
  { id: 'dataset-guide', num: '3', title: 'Building a good dataset', description: 'Make stronger choices about images, captions, settings, and checkpoints.', source: datasetGuide },
  { id: 'settings-reference', num: '4', title: 'Settings reference', description: 'Every setting explained — what it does, its default, and when to change it.', source: settingsReference },
  { id: 'troubleshooting', num: '5', title: 'Troubleshooting', description: 'Find a symptom, understand the cause, and apply the shortest reliable fix.', source: troubleshooting },
]
const HELP_CHAPTER = { id: 'getting-help', num: '6', title: 'Getting help', description: 'Create a useful report and share the details needed to solve a problem.', source: gettingHelp, extra: 'diagnostic' }

const cleanHeading = (heading) => heading.replace(/[`*_]/g, '')

// Append focus=<id> to a topic's app route, preserving any query already there
// (e.g. /datasets?section=scrape&panel=scan → &focus=ds-scrape-scan).
const routeWithFocus = (app) => {
  if (!app.focus) return app.route
  return `${app.route}${app.route.includes('?') ? '&' : '?'}focus=${app.focus}`
}

export default function GuidePage({ helpOnly = false }) {
  const { section } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const targetHeading = searchParams.get('h')
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const articleRef = useRef(null)
  const searchChapters = useMemo(() => guideChapters([...CHAPTERS, HELP_CHAPTER]), [])
  const searchIndex = useMemo(() => searchChapters.flatMap((item) => [
    { chapter: item, title: item.title, anchor: '', text: `${item.title}\n${item.description}\n${item.source.split(/^##\s/m)[0]}`.toLowerCase() },
    ...buildGuideTextIndex(item.source).map((entry) => ({ ...entry, chapter: item })),
  ]), [searchChapters])
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const results = words.length ? searchIndex.filter((entry) => words.every((word) => entry.text.includes(word))) : []
  const chapters = useMemo(() => guideChapters(helpOnly ? [HELP_CHAPTER] : CHAPTERS), [helpOnly])
  const selected = findGuideChapter(chapters, helpOnly ? HELP_CHAPTER.id : section)
  const chapter = selected || { id: section, source: '' }
  const contributors = plugins().filter((plugin) => plugin.guide?.chapters?.some((item) => item.id === chapter.id)
    || plugin.guide?.sections?.some((item) => item.chapter === chapter.id))
  const revisionParts = [...(chapter.plugin ? [] : [revisions[chapter.id]]), ...contributors.map((plugin) => revisions[`plugin:${plugin.id}`])]
  const revisionKnown = revisionParts.length > 0 && revisionParts.every((part) => part?.date)
  const updated = revisionKnown ? revisionParts.map((part) => part.date).sort().at(-1) : null
  const locallyEdited = revisionParts.some((part) => part?.modified)
  const idx = chapters.indexOf(selected)
  const prev = idx > 0 ? chapters[idx - 1] : null
  const next = idx < chapters.length - 1 ? chapters[idx + 1] : null
  const headings = [...chapter.source.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
    title: cleanHeading(match[1]), id: markdownHeadingId(match[1]),
  }))
  const readingMinutes = Math.max(1, Math.ceil(chapter.source.trim().split(/\s+/).length / 210))
  const jumpToHeading = (id) => {
    const element = document.getElementById(id)
    if (!element) return
    element.tabIndex = -1
    element.focus({ preventScroll: true })
    element.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  // doc → app: an "Open this screen →" button in each guide section header that
  // has a matching help topic. Keyed by heading anchor; the FIRST topic in the
  // registry for that anchor wins (see helpRegistry ordering).
  const sectionActions = useMemo(() => {
    const map = {}
    for (const t of helpTopicsForChapter(chapter.id)) {
      if (map[t.guide.anchor]) continue
      map[t.guide.anchor] = (
        <button type="button" onClick={() => navigate(routeWithFocus(t.app))}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20">
          Open Screen →
        </button>
      )
    }
    return map
  }, [chapter.id, navigate])

  // A chapter switch is a new "page" — land the reader at its top, unless the
  // link asked for a specific heading (?h=), which the effect below handles.
  useEffect(() => { if (!targetHeading) window.scrollTo(0, 0) }, [chapter.id, targetHeading])

  // app → doc landing: scroll to the requested heading and flash a ring so the
  // eye catches where it landed. Runs after render, so the element exists.
  useEffect(() => {
    if (!targetHeading) return undefined
    const el = document.getElementById(targetHeading)
    if (!el) return undefined
    el.tabIndex = -1
    el.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    const ring = ['ring-2', 'ring-indigo-400/70', 'ring-offset-2', 'ring-offset-app']
    el.classList.add(...ring)
    const t = setTimeout(() => el.classList.remove(...ring), 2000)
    return () => clearTimeout(t)
  }, [targetHeading, chapter.id])

  const missingHeading = targetHeading && !guideHeadings(chapter.source).includes(targetHeading)
  const missingTopic = missingHeading && helpTopicsForChapter(chapter.id).find(topic => topic.guide.anchor === targetHeading)
  if (!selected || missingHeading) return <div role="status" className="mx-auto max-w-3xl p-6 text-content">
    <h1 className="text-xl font-semibold">This guide is not available</h1>
    <p>{missingTopic?.plugin
      ? `The installed ${missingTopic.pluginName} plugin does not provide this guide section. Update the plugin in Plugins to read its current guide.`
      : 'The product may be inactive or removed, or this guide link is outdated. Open Plugins to check its installed version.'}</p>
    <Link to="/plugins" className="underline">Open Plugins</Link>
    {selected && <p><Link to={`/guide/${chapter.id}`} className="underline">Read the available sections of {chapter.title}</Link></p>}
  </div>

  const navItem = (c, chip) => {
    const isActive = c.id === chapter.id
    const base = chip
      ? `flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
          isActive ? 'border-border-strong bg-surface-raised text-content' : 'border-border text-content-muted hover:text-content'}`
      : `relative flex w-full items-baseline gap-2.5 rounded-md px-3 py-2 text-left text-sm ${
          isActive ? 'bg-surface-raised text-content' : 'text-content-muted hover:bg-surface hover:text-content'}`
    return (
      <button key={c.id} type="button" onClick={() => navigate(`/guide/${c.id}`)}
        aria-current={isActive ? 'page' : undefined} className={base}>
        {!chip && isActive && (
          <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded bg-gradient-primary" />
        )}
        <span className={`font-mono text-2xs ${isActive ? 'text-content' : 'text-content-subtle'}`}>{c.num}</span>
        <span className="font-medium">{c.title}</span>
      </button>
    )
  }

  return (
    <div className={`guide-page ${helpOnly
      ? 'mx-auto max-w-5xl xl:grid xl:grid-cols-[minmax(0,1fr)_190px] xl:items-start xl:gap-7'
      : 'lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-7 xl:grid-cols-[210px_minmax(0,1fr)_190px]'}`}>
      <ReadingProgress articleRef={articleRef} chapterId={chapter.id} />
      <section className="guide-search mb-4 min-w-0 lg:col-span-full" aria-label="Guide Search">
        <div className="mb-1 flex items-center gap-2">
          <label htmlFor="guide-search" className="block text-sm font-medium">Search Guide</label>
          <HelpBadge topic="guide-reader" />
        </div>
        <input ref={searchRef} id="guide-search" type="search" value={query}
          aria-controls="guide-search-results" onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('')
            if (event.key === 'ArrowDown') { event.preventDefault(); resultsRef.current?.querySelector('a')?.focus() }
            if (event.key === 'Enter' && results.length) { event.preventDefault(); resultsRef.current?.querySelector('a')?.click() }
          }} placeholder="Find a topic"
          className="min-h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-content lg:text-sm" />
        <div id="guide-search-results" ref={resultsRef}>
          {words.length > 0 && <>
            <p role="status" className="my-2 text-sm text-content-muted">{results.length ? `${results.length} results` : 'No matches. Try another term.'}</p>
            <ul className="max-h-64 overflow-y-auto" onKeyDown={(event) => {
              if (event.key === 'Escape') { setQuery(''); searchRef.current?.focus() }
            }}>
              {results.map((result) => <li key={`${result.chapter.id}:${result.anchor}`}>
                <Link to={`${result.chapter.id === HELP_CHAPTER.id ? '/help' : `/guide/${result.chapter.id}`}${result.anchor ? `?h=${encodeURIComponent(result.anchor)}` : ''}`}
                  onClick={() => { setQuery(''); if (chapter.id === result.chapter.id && result.anchor) jumpToHeading(result.anchor) }}
                  className="flex min-h-10 flex-wrap items-center gap-x-2 rounded-md px-3 py-2 text-sm hover:bg-surface-raised">
                  <span>{result.title}</span><span className="text-xs text-content-subtle">{result.chapter.title}</span>
                </Link>
              </li>)}
            </ul>
          </>}
        </div>
      </section>
      {/* lg:self-stretch: the grid is items-start, which shrinks the aside to the
          height of its nav — a sticky child has no room to travel in a parent
          exactly its own height. Stretching makes the aside as tall as the page. */}
      {!helpOnly && <aside className="lg:self-stretch">
        {/* Mobile: horizontal chapter chips. `relative` for the same reason as
            the Settings and Dataset rails — an absolutely positioned descendant
            (an `.sr-only` label is one) escapes an unpositioned scroller and
            widens the document past the viewport. */}
        <nav aria-label="Guide chapters" className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
          {chapters.map((c) => navItem(c, true))}
        </nav>
        {/* Desktop: sticky numbered chapter rail */}
        <nav aria-label="Guide chapters" className="hidden lg:block lg:sticky lg:top-[calc(var(--app-header-h)+1rem)] lg:max-h-[calc(100vh-var(--app-header-h)-2rem)] lg:overflow-y-auto">
          <p className="px-3 pb-2 font-mono text-2xs uppercase tracking-[0.18em] text-content-subtle">Field manual</p>
          <div className="flex flex-col gap-0.5">
            {chapters.map((c) => navItem(c, false))}
          </div>
        </nav>
      </aside>}

      <article ref={articleRef} className={`guide-article min-w-0 max-w-4xl pb-10 ${helpOnly ? 'mx-auto' : 'mt-2 lg:mt-0'}`}>
        <header className="relative mb-3 overflow-hidden rounded-2xl border border-border bg-surface px-4 py-4 sm:px-5 sm:py-5">
          <div className="relative">
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-[0.14em] text-content-subtle">
              <span className="rounded-md border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-indigo-300">
                {helpOnly ? 'Support' : `Chapter ${chapter.num}`}
              </span>
              <span>{readingMinutes} min read</span>
              <span>{updated ? <>Updated <time dateTime={updated}>{updated}</time></> : 'Revision unavailable'}</span>
              {locallyEdited && <span>Local Edits</span>}
              {!helpOnly && <><span aria-hidden>·</span><span>{idx + 1} of {chapters.length}</span></>}
            </div>
            <h1 className="m-0 max-w-2xl text-2xl font-bold tracking-tight text-content sm:text-2xl">{chapter.title}</h1>
            <p className="mb-0 mt-2 max-w-2xl text-sm leading-relaxed text-content-muted sm:text-base">{chapter.description}</p>
          </div>
        </header>

        {headings.length > 0 && (
          <nav aria-label="On this page" className="mb-3 rounded-xl border border-border bg-surface p-3 xl:hidden">
            <p className="m-0 mb-2 font-mono text-2xs uppercase tracking-[0.16em] text-content-subtle">On this page</p>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {headings.map((item) => (
                <button key={item.id} type="button" onClick={() => jumpToHeading(item.id)}
                  className="shrink-0 rounded-full border border-border bg-transparent px-2.5 py-1 text-xs text-content-muted hover:border-border-strong hover:text-content">{item.title}</button>
              ))}
            </div>
          </nav>
        )}

        <Markdown source={chapter.source} variant="guide" sectionActions={sectionActions} />

        {chapter.extra === 'diagnostic' && (
          <div className="mt-6">
            <DiagnosticReport />
          </div>
        )}

        {!helpOnly && <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4">
          {prev ? (
            <Link to={`/guide/${prev.id}`} className="group flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 no-underline hover:bg-surface-raised">
              <span aria-hidden className="text-content-subtle">←</span>
              <span className="min-w-0"><span className="block font-mono text-2xs uppercase tracking-wider text-content-subtle">Previous</span><span className="block truncate text-sm font-medium text-content-muted group-hover:text-content">{prev.title}</span></span>
            </Link>
          ) : <span />}
          {next ? (
            <Link to={`/guide/${next.id}`} className="group flex min-w-0 items-center justify-end gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-right no-underline hover:bg-surface-raised">
              <span className="min-w-0"><span className="block font-mono text-2xs uppercase tracking-wider text-content-subtle">Next</span><span className="block truncate text-sm font-medium text-content-muted group-hover:text-content">{next.title}</span></span>
              <span aria-hidden className="text-content-subtle">→</span>
            </Link>
          ) : <span />}
        </div>}
      </article>

      <aside className="hidden xl:block xl:self-stretch">
        <nav aria-label="On this page" className="sticky top-[calc(var(--app-header-h)+1rem)] max-h-[calc(100vh-var(--app-header-h)-2rem)] overflow-y-auto border-l border-border pl-4">
          <p className="m-0 mb-2 font-mono text-2xs uppercase tracking-[0.16em] text-content-subtle">On this page</p>
          <div className="flex flex-col gap-0.5">
            {headings.map((item) => (
              <button key={item.id} type="button" onClick={() => jumpToHeading(item.id)}
                className="rounded-md bg-transparent px-2 py-1.5 text-left text-xs leading-snug text-content-subtle hover:bg-surface hover:text-content">{item.title}</button>
            ))}
          </div>
        </nav>
      </aside>
    </div>
  )
}
