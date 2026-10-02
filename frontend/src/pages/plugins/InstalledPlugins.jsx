import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { pluginWhatsNew } from '../../plugins/registry.js'
import { sortedEntries } from '../../whatsNew.js'
import InstallRunner from '../../components/setup/InstallRunner'
import HeaderMenu from '../../components/common/HeaderMenu'
import { pendingLabel, pluginActive, pluginDesired } from '../../plugins/lifecycle.js'
import { productReadiness } from '../../plugins/readiness.js'
import { pluginSettingsPath } from '../pluginSettings.js'

const BTN = 'min-h-10 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-raised disabled:opacity-50'

const STATE_LABEL = {
  loaded: 'Active now', disabled: 'Inactive', pending: 'Not active yet', error: 'Failed to load',
  incompatible: 'Incompatible', misplaced: 'Misplaced',
}

function stateClass(state) {
  if (state === 'loaded') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
  if (state === 'disabled') return 'border-border bg-surface text-content-muted'
  return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
}

function mark(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase()
}

function browserLoadProblem(pluginId) {
  const problems = globalThis.window?.lds?.loadProblems
  if (!Array.isArray(problems)) return null
  return problems.find(item => item && item.plugin === pluginId) || null
}

function reloadPage() {
  globalThis.window?.location?.reload()
}

export default function InstalledPlugins({ plugins = [], busy, caps, capsKnown = false, onToggle, onRemove, onInstalled }) {
  if (!plugins.length) {
    return <p className="py-6 text-sm text-content-muted">No plugin installed yet.</p>
  }
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {plugins.map(plugin => {
        const news = sortedEntries(pluginWhatsNew(plugin.id))
        const desired = pluginDesired(plugin)
        const pending = pendingLabel(plugin)
        const removing = plugin.pending_action === 'remove'
        const packagePending = ['install', 'update', 'remove'].includes(plugin.pending_action)
        const active = pluginActive(plugin)
        const loadProblem = browserLoadProblem(plugin.id)
        const readiness = active && capsKnown && !loadProblem ? productReadiness(plugin.id, caps) : []
        const settingsPath = pluginSettingsPath(plugin.id)
        const experience = active && !loadProblem ? plugin.package_contract?.experience : null
        const state = loadProblem ? 'error' : (active ? 'loaded' : (plugin.state || 'disabled'))
        return (
          <article key={plugin.id} id={'plugin-row-' + plugin.id} data-plugin-id={plugin.id}
            aria-labelledby={'plugin-title-' + plugin.id}
            className="flex min-w-0 scroll-mt-6 flex-col rounded-xl border border-border-strong bg-surface shadow-sm">
            <header className="flex flex-wrap items-start justify-between gap-4 rounded-t-xl border-b border-border bg-surface-raised px-4 py-4 sm:px-5">
              <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
                <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-sm font-semibold uppercase">{mark(plugin.name)}</span>
                <div className="min-w-0">
                  <h3 id={'plugin-title-' + plugin.id} className="break-words text-xl font-semibold leading-snug text-content">{plugin.name}</h3>
                  <p className="mt-1 text-xs text-content-muted">Installed {plugin.installed_version || plugin.version} · {plugin.official ? 'LDS' : plugin.bundled ? 'Included' : plugin.author || 'External'}</p>
                </div>
              </div>
              <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ' + stateClass(state)}>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                {loadProblem ? 'Interface did not load' : (active ? 'Active now' : STATE_LABEL[plugin.state] || plugin.state || 'Inactive')}
              </span>
            </header>
            <div className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
              {loadProblem && (
                <div role="alert" data-plugin-load-problem={plugin.id} className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  <p>{loadProblem.reason || 'This plugin’s interface did not load.'}</p>
                  <button type="button" className={BTN} onClick={reloadPage}>Reload page</button>
                </div>
              )}
              {pending && <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-content" data-plugin-pending>{pending}</p>}
              {plugin.description && <p className="text-sm leading-relaxed text-content-muted">{plugin.description}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {experience?.entrypoints?.map((entry, index) => (
                  <Link key={entry.path} to={entry.path} className={index === 0 ? BTN + ' border-primary/40 text-primary hover:bg-primary/10' : BTN}>{entry.label}</Link>
                ))}
                <Link to={settingsPath} className={BTN} aria-label={`Settings for ${plugin.name}`}>Settings</Link>
                {plugin.state !== 'misplaced' && plugin.state !== 'incompatible' && (
                  <button type="button" className={BTN} disabled={busy || removing}
                    onClick={() => onToggle(plugin, !desired)} aria-pressed={desired}
                    aria-label={`${plugin.pending_action === 'enable' || plugin.pending_action === 'disable' ? 'Undo change for' : desired ? 'Turn off' : 'Turn on'} ${plugin.name}`}>
                    {plugin.pending_action === 'enable' || plugin.pending_action === 'disable' ? 'Undo change' : desired ? 'Turn off' : 'Turn on'}
                  </button>
                )}
                {!plugin.bundled && (
                  <HeaderMenu triggerLabel={<MoreHorizontal aria-hidden="true" className="h-7 w-5" />} triggerTitle={`More actions for ${plugin.name}`}>
                    {(close) => (
                      <button type="button" role="menuitem" className={BTN + ' flex items-center gap-2 text-left hover:text-rose-300'}
                        disabled={busy || packagePending} aria-label={`Remove ${plugin.name}`}
                        onClick={() => { close(); onRemove(plugin) }}>
                        <Trash2 aria-hidden="true" className="h-4 w-4" />Remove plugin
                      </button>
                    )}
                  </HeaderMenu>
                )}
              </div>
              {plugin.error && <p className="mt-1 text-xs text-amber-500">{plugin.error}</p>}
              {active && !capsKnown && <p className="text-xs text-content-muted">Checking configured components</p>}
              {readiness.length > 0 && (
                <p className="text-xs text-content-muted" data-plugin-readiness>
                  Configured components · {readiness.filter(row => row.state === 'ready').length}/{readiness.length} ready
                </p>
              )}
              {plugin.environment && (
                <div className="mt-1 space-y-2 rounded-md border border-border p-3 [&_button]:min-h-10 lg:[&_button]:min-h-0">
                  <p className="text-sm font-medium">Python environment · {plugin.environment.ready ? 'Ready' : 'Needs installation'}</p>
                  {plugin.environment.reason && <p className="text-xs text-content-muted">{plugin.environment.reason}</p>}
                  {plugin.environment.can_install && (
                    <InstallRunner action={plugin.environment.action}
                      buttonLabel={plugin.environment.ready ? 'Repair Python environment' : 'Install Python environment'}
                      onDone={onInstalled} />
                  )}
                </div>
              )}
              {news.length > 0 && (
                <details className="mt-1">
                  <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium lg:min-h-0">What’s new in {plugin.name}</summary>
                  <ul className="space-y-2 text-sm text-content-muted">
                    {news.slice(0, 3).map(entry => <li key={entry.id}>{entry.title}</li>)}
                  </ul>
                </details>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
