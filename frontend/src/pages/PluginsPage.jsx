import { useCallback, useEffect, useRef, useState } from 'react'
import { Puzzle, RefreshCw, Upload } from 'lucide-react'
import { apiFetch, postForm, postJson, del } from '../api/fetchClient'
import { useToast } from '../components/common/Toast'
import { Card, SectionHeader } from '../components/settings/primitives'
import { waitForPluginBoot } from '../plugins/lifecycle.js'
import { useSearchParams } from 'react-router'
import { useCapabilities } from '../context/CapabilitiesContext'
import InstalledPlugins from './plugins/InstalledPlugins.jsx'

const BTN = 'min-h-10 lg:min-h-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-raised disabled:opacity-50'
const BTN_PRIMARY = BTN + ' border-primary bg-primary text-primary-foreground hover:bg-primary/90'

export function PluginAdminLock({ value, onChange, onUnlock, checking, rejected }) {
  return (
    <section id="plugin-administration" aria-labelledby="plugin-administration-title"
      className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
      <h2 id="plugin-administration-title" className="font-semibold">Plugin installation is locked</h2>
      <p>This browser does not have permission to install or change plugins. This also applies when connecting from another computer on your local network.</p>
      <form onSubmit={onUnlock} className="space-y-2">
        <label htmlFor="plugin-admin-token" className="block font-medium">Plugin admin token</label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="plugin-admin-token" type="password" autoComplete="off" required minLength={32}
            value={value} onChange={event => onChange(event.target.value)}
            aria-describedby="plugin-admin-token-hint" aria-invalid={rejected || undefined}
            className="min-h-10 min-w-0 flex-1 rounded border border-border bg-surface px-3" />
          <button type="submit" disabled={checking}
            className="min-h-10 rounded-md border border-primary bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {checking ? 'Checking token' : 'Unlock plugin changes'}
          </button>
        </div>
        <p id="plugin-admin-token-hint" className="text-xs text-content-muted">Use the separate plugin admin token, not an API key or the app access token. It is kept only until this page is reloaded.</p>
        {rejected && <p role="alert" className="text-amber-500">This token was not accepted. Check that it matches LDS_PLUGIN_ADMIN_TOKEN on the computer running LDS.</p>}
      </form>
    </section>
  )
}

export function PluginInstallConsent({ consent, busy = false, onInstall, onCancel }) {
  const issues = (Array.isArray(consent?.compatibility_issues) ? consent.compatibility_issues : [])
    .filter(issue => issue && typeof issue.message === 'string' && issue.message.trim())
  const blocked = consent?.can_install !== true
  return (
    <Card title={`Install ${consent?.manifest?.name || 'plugin'}?`} id="plugins-consent">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-content-muted">Id</dt><dd>{consent?.manifest?.id} · v{consent?.manifest?.version}</dd>
        <dt className="text-content-muted">Author</dt><dd>{consent?.manifest?.author || '—'}</dd>
        <dt className="text-content-muted">Description</dt><dd>{consent?.manifest?.description || '—'}</dd>
        <dt className="text-content-muted">Installs to</dt><dd className="break-all">{consent?.install_dir}</dd>
      </dl>
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-amber-500">
          {issues.map((issue, index) => (
            <li key={`${issue.code || 'issue'}-${index}`} role="alert">{issue.message}</li>
          ))}
        </ul>
      )}
      {blocked && issues.length === 0 && (
        <p role="alert" className="mt-3 text-sm text-amber-500">This plugin cannot be installed in the current app configuration.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy || blocked} onClick={onInstall}>Install</button>
        <button type="button" className={BTN} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  )
}

export default function PluginsPage() {
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const { caps, known: capsKnown, refresh: refreshCaps } = useCapabilities()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [applyWarning, setApplyWarning] = useState('')
  const [consent, setConsent] = useState(null)
  const [adminToken, setAdminToken] = useState('')
  const [adminDraft, setAdminDraft] = useState('')
  const [checkingToken, setCheckingToken] = useState(false)
  const [tokenRejected, setTokenRejected] = useState(false)
  const fileRef = useRef(null)
  const restartAbort = useRef(null)
  const scrolledPlugin = useRef('')
  const requestedPlugin = searchParams.get('plugin') || ''

  const adminOptions = { headers: adminToken ? { 'X-LDS-Plugin-Admin': adminToken } : {} }
  const mutation = (url, body) => postJson(url, body, adminOptions)
  const upload = (form) => postForm('/api/plugins/install', form, adminOptions)

  const load = useCallback(async (token = adminToken) => {
    setCheckingToken(true)
    try {
      const next = await apiFetch('/api/plugins/', {
        cache: 'no-store',
        headers: token ? { 'X-LDS-Plugin-Admin': token } : {},
      })
      if (next.boot_id && window.lds?.bootId && next.boot_id !== window.lds.bootId) {
        window.location.reload()
        return
      }
      setData(next)
      setError('')
      setTokenRejected(Boolean(token) && next.can_manage === false)
    } catch (e) {
      setError(e?.message || 'Could not read the plugin list.')
    } finally {
      setCheckingToken(false)
    }
  }, [adminToken])

  useEffect(() => { load() }, [load])
  useEffect(() => () => restartAbort.current?.abort(), [])
  useEffect(() => {
    if (!requestedPlugin || !data || scrolledPlugin.current === requestedPlugin) return
    const element = document.getElementById('plugin-row-' + requestedPlugin)
    if (element) { element.scrollIntoView({ block: 'nearest' }); scrolledPlugin.current = requestedPlugin }
  }, [requestedPlugin, data])

  const unlock = (event) => {
    event.preventDefault()
    setTokenRejected(false)
    if (adminToken === adminDraft) load(adminDraft)
    else setAdminToken(adminDraft)
  }

  const apply = async () => {
    setBusy(true)
    setApplying(true)
    setApplyError('')
    setApplyWarning('')
    const controller = new AbortController()
    restartAbort.current = controller
    try {
      const result = await mutation('/api/plugins/apply', {})
      if (!result.ok || !result.restarting) throw new Error(result.error || 'The restart could not be started.')
      setApplyWarning((result.warnings || []).join(' '))
      await waitForPluginBoot(result.boot_id || data?.boot_id, { signal: controller.signal })
      window.location.reload()
    } catch (e) {
      if (!controller.signal.aborted) setApplyError(e?.message || 'Could not restart LDS.')
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        setApplying(false)
      }
    }
  }

  const toggle = async (plugin, on) => {
    setBusy(true)
    try {
      await mutation(`/api/plugins/${encodeURIComponent(plugin.id)}/${on ? 'enable' : 'disable'}`, {})
      setApplyError('')
      await load()
    } catch (e) {
      toast.error(e?.message || 'Could not change the plugin.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (plugin) => {
    if (!window.confirm(`Remove ${plugin.name} after restarting? Its data will be kept and reused when you reinstall it.`)) return
    setBusy(true)
    try {
      await del(`/api/plugins/${encodeURIComponent(plugin.id)}`, adminOptions)
      setApplyError('')
      await load()
    } catch (e) {
      toast.error(e?.message || 'Could not remove the plugin.')
    } finally {
      setBusy(false)
    }
  }

  const inspect = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await upload(fd)
      setConsent({ file, manifest: res.manifest, install_dir: res.install_dir,
        can_install: res.can_install === true,
        compatibility_issues: Array.isArray(res.compatibility_issues) ? res.compatibility_issues : [] })
    } catch (e) {
      toast.error(e?.message || 'That archive is not a plugin.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmInstall = async (replace = false) => {
    if (!consent?.can_install) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', consent.file)
      fd.append('confirm', '1')
      if (replace) fd.append('replace', '1')
      await upload(fd)
      toast.success(`${consent.manifest.name} is ready to apply. Restart LDS to use it.`)
      setConsent(null)
      setApplyError('')
      await load()
    } catch (e) {
      if (/already installed/i.test(e?.message || '') && !replace) {
        if (window.confirm(`${consent.manifest.name} is already installed. Replace it?`)) return confirmInstall(true)
        return
      }
      toast.error(e?.message || 'Install failed.')
    } finally {
      setBusy(false)
    }
  }

  const plugins = data?.plugins || []
  const restart = data?.restart
  const pendingRestart = Boolean(data?.pending_restart)
  const locked = data?.can_manage === false

  return (
    <div className="mx-auto w-full space-y-4" data-probe-panel="plugins" data-probe-content="plugins">
      <div className="space-y-2">
        <SectionHeader eyebrow="Workspace" title="Plugins"
          description="The plugins installed with this app, and any ZIP you add yourself." />
        <p className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
          <Puzzle aria-hidden="true" className="h-3.5 w-3.5" />
          Your data stays with LDS when a plugin is updated or removed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className={BTN + ' inline-flex cursor-pointer items-center gap-1'}>
          <Upload aria-hidden="true" className="h-3.5 w-3.5" /> Install from a ZIP
          <input ref={fileRef} type="file" accept=".ldsplugin,.zip,application/zip" className="sr-only"
            onChange={(e) => inspect(e.target.files && e.target.files[0])} disabled={busy || locked} />
        </label>
        <span className="text-xs text-content-muted">The archive is inspected first; nothing is written until you confirm.</span>
      </div>

      {locked && <PluginAdminLock value={adminDraft} onChange={setAdminDraft} onUnlock={unlock}
        checking={checkingToken} rejected={tokenRejected} />}

      {error && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{error}</p>}
      {data?.lifecycle_errors?.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <p className="font-medium">Some plugin changes could not be applied.</p>
          {data.lifecycle_errors.map((item, index) => <p key={index}>{typeof item === 'string' ? item : `${item.id}: ${item.error || item.reason}`}</p>)}
        </div>
      )}

      {(pendingRestart || applying) && restart && (
        <div className="space-y-3 rounded-md border border-primary/40 bg-primary/10 p-4 text-sm" data-probe-panel="plugin-apply">
          <div className="flex flex-wrap items-center gap-3">
            <div role="status" aria-live="polite" className="flex min-w-0 flex-1 basis-64 items-start gap-2">
              <RefreshCw aria-hidden="true" className={'mt-0.5 h-4 w-4 shrink-0' + (applying ? ' animate-spin' : '')} />
              <div>
                <p className="font-medium">{applying ? 'Restarting LDS' : 'Changes ready to apply'}</p>
                <p className="mt-1 text-content-muted">{applying ? 'Waiting for the new server. This page will reload when it is ready.' : 'Your choices are saved. The current features stay available until LDS restarts.'}</p>
              </div>
            </div>
            {restart.can_apply && <button type="button" className={BTN_PRIMARY + ' shrink-0'} disabled={busy} onClick={apply}>Apply &amp; Restart</button>}
          </div>
          {!restart.can_apply && <p className="text-content-muted">{restart.how}</p>}
          {applyWarning && <p role="status" className="text-amber-500">{applyWarning}</p>}
          {applyError && <p role="alert" className="text-amber-500">{applyError}</p>}
        </div>
      )}

      <InstalledPlugins plugins={plugins} busy={busy || locked} caps={caps} capsKnown={capsKnown}
        onToggle={toggle} onRemove={remove} onInstalled={() => { load(); refreshCaps(true) }} />

      {data?.transactions?.length > 0 && (
        <details className="rounded-lg border border-border p-3 text-sm" open={data.transactions[0].phase === 'rolled_back'}>
          <summary className="min-h-10 cursor-pointer py-2 font-medium">Installation history</summary>
          <ul className="divide-y divide-border">{data.transactions.map(item => <li key={item.id} className="py-3">
            <p className="font-medium">{item.plugins.map(plugin => `${plugin.id}${plugin.version ? ` ${plugin.version}` : ''}`).join(', ')}</p>
            <p className="text-content-muted">{item.phase === 'committed' ? 'Applied successfully.' : item.phase === 'rolled_back'
              ? 'Installation did not complete. Your previous plugins and data were restored.' : 'Waiting for the installation to finish.'}</p>
            {item.reason && <p className="mt-1 text-content-muted">{item.reason}</p>}
          </li>)}</ul>
        </details>
      )}

      {consent && (
        <PluginInstallConsent consent={consent} busy={busy}
          onInstall={() => confirmInstall(false)} onCancel={() => setConsent(null)} />
      )}
    </div>
  )
}
