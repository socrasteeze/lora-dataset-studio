import { useCallback, useEffect, useState } from 'react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { useToast } from '../common/Toast'
import { INPUT_CLASS, Card } from './primitives'
import ResetToDefault from './ResetToDefault'

const ROLES = [
  { id: 'standalone', label: 'Standalone',
    help: 'Single machine — today’s behaviour. No peers.' },
  { id: 'primary', label: 'Primary (hub)',
    help: 'Owns datasets. Other installs join as compute peers over Tailscale.' },
  { id: 'peer', label: 'Peer (worker)',
    help: 'Rents this machine’s GPU to a Primary. Open the Primary’s URL in the browser to edit datasets.' },
]

export default function DevicesSection({ config, setField, handleSave, configDefaults }) {
  const toast = useToast()
  const role = config.cluster?.role || 'standalone'
  const [status, setStatus] = useState(null)
  const [joinLabel, setJoinLabel] = useState('')
  const [minted, setMinted] = useState(null)
  const [peerUrl, setPeerUrl] = useState(config.cluster?.primary_url || '')
  const [peerToken, setPeerToken] = useState('')
  const [peerName, setPeerName] = useState(config.cluster?.device_name || '')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await apiFetch('/api/cluster/status'))
    } catch (e) {
      /* section still usable offline from config */
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    setPeerUrl(config.cluster?.primary_url || '')
    setPeerName(config.cluster?.device_name || '')
  }, [config.cluster?.primary_url, config.cluster?.device_name])

  const mintToken = async () => {
    setBusy(true)
    try {
      if (!(await handleSave())) return
      const d = await postJson('/api/cluster/join-tokens', { label: joinLabel || undefined })
      setMinted(d)
      toast.success('Join token created — copy it to the peer install')
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Could not create join token')
    } finally {
      setBusy(false)
    }
  }

  const connectPeer = async () => {
    setBusy(true)
    try {
      setField('cluster', 'role', 'peer')
      setField('cluster', 'primary_url', peerUrl.trim())
      setField('cluster', 'device_name', peerName.trim())
      if (!(await handleSave())) return
      const d = await postJson('/api/cluster/peer/connect', {
        primary_url: peerUrl.trim(),
        token: peerToken.trim(),
        name: peerName.trim() || undefined,
      })
      if (!d.ok) { toast.error(d.error || 'Join failed'); return }
      toast.success('Joined Primary — this machine will pull GPU jobs')
      setPeerToken('')
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Join failed')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id) => {
    if (!window.confirm('Revoke this peer? Pending jobs for it will fail.')) return
    try {
      await postJson(`/api/cluster/devices/${id}/revoke`, {})
      toast.success('Peer revoked')
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Revoke failed')
    }
  }

  const rename = async (id, name) => {
    try {
      await postJson(`/api/cluster/devices/${id}/rename`, { name })
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Rename failed')
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Role"
        help="Pick which machine owns the datasets (Primary) and which ones only rent GPU time (Peer). Both installs keep their own ComfyUI / Ollama / ai-toolkit.">
        <fieldset id="cluster-role" className="space-y-2">
          <legend className="sr-only">Cluster role</legend>
          {ROLES.map((r) => (
            <label key={r.id} className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="cluster-role" className="mt-1"
                checked={role === r.id}
                onChange={() => setField('cluster', 'role', r.id)} />
              <span>
                <span className="text-sm font-medium text-content">{r.label}</span>
                <span className="block text-xs text-content-muted">{r.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3">
          <label htmlFor="cluster-device-name" className="block text-sm font-medium text-content">
            Device name
          </label>
          <input id="cluster-device-name" type="text"
            value={config.cluster?.device_name ?? ''}
            onChange={(e) => setField('cluster', 'device_name', e.target.value)}
            placeholder="e.g. Desktop 5090 / G18 laptop"
            className={`${INPUT_CLASS} max-w-md`} />
          <ResetToDefault label="Device name" section="cluster" field="device_name"
            config={config} configDefaults={configDefaults} setField={setField} />
        </div>
        {status?.node_id && (
          <p className="mt-2 font-mono text-[11px] text-content-subtle">
            node id · {status.node_id}
          </p>
        )}
      </Card>

      {role === 'primary' && (
        <Card title="Compute peers"
          help="Generate a join token on this Primary, then paste it into the peer install (Settings → Devices → Peer). Tailscale MagicDNS hostnames work best.">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="join-label" className="block text-xs text-content-muted">Label (optional)</label>
              <input id="join-label" value={joinLabel} onChange={(e) => setJoinLabel(e.target.value)}
                className={`${INPUT_CLASS} max-w-[12rem]`} placeholder="laptop" />
            </div>
            <button type="button" disabled={busy} onClick={mintToken}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Generate join token
            </button>
          </div>
          {minted?.token && (
            <div className="mt-3 rounded-md border border-border-strong bg-surface-raised p-3">
              <p className="text-xs text-content-muted mb-1">Copy this once — it is not shown again after restart.</p>
              <code className="block break-all text-sm text-content select-all">{minted.token}</code>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {(status?.peers || []).map((p) => (
              <li key={p.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span aria-hidden className={`h-2 w-2 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-white/20'}`} />
                <input
                  defaultValue={p.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== p.name) rename(p.id, v)
                  }}
                  className="min-w-[8rem] flex-1 rounded border border-transparent bg-transparent px-1 text-content focus:border-border-strong"
                  aria-label="Peer name"
                />
                <span className="text-xs text-content-subtle">
                  {p.online ? (p.busy ? 'busy' : 'online') : 'offline'}
                  {p.capabilities?.vram_gb != null ? ` · ~${p.capabilities.vram_gb} GB` : ''}
                </span>
                <button type="button" onClick={() => revoke(p.id)}
                  className="text-xs text-rose-400 hover:underline">Revoke</button>
              </li>
            ))}
            {!(status?.peers || []).length && (
              <li className="text-sm text-content-muted">No peers yet.</li>
            )}
          </ul>
          {status?.pending_remote_jobs > 0 && (
            <p className="mt-2 text-xs text-amber-400">
              {status.pending_remote_jobs} remote job(s) waiting for a peer to pull.
            </p>
          )}
        </Card>
      )}

      {role === 'peer' && (
        <Card title="Join a Primary"
          help="Paste the Primary’s Tailscale URL and a join token. After joining, use the Primary’s web UI from this laptop — datasets stay on the Primary; this box only runs GPU work.">
          <div className="space-y-3 max-w-lg">
            <div>
              <label htmlFor="peer-primary-url" className="block text-sm font-medium text-content">Primary URL</label>
              <input id="peer-primary-url" value={peerUrl}
                onChange={(e) => setPeerUrl(e.target.value)}
                placeholder="http://desktop-name:5050"
                className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="peer-join-token" className="block text-sm font-medium text-content">Join token</label>
              <input id="peer-join-token" value={peerToken}
                onChange={(e) => setPeerToken(e.target.value)}
                className={INPUT_CLASS} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="peer-name" className="block text-sm font-medium text-content">Name on Primary</label>
              <input id="peer-name" value={peerName}
                onChange={(e) => setPeerName(e.target.value)}
                className={INPUT_CLASS} placeholder="G18 5080" />
            </div>
            <button type="button" disabled={busy || !peerUrl.trim() || !peerToken.trim()}
              onClick={connectPeer}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Join Primary
            </button>
          </div>
          {status?.peer_worker && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-content-muted">Worker</dt>
              <dd>{status.peer_worker.running ? 'running' : 'stopped'}
                {status.peer_worker.connected ? ' · connected' : ' · not connected'}</dd>
              <dt className="text-content-muted">Current job</dt>
              <dd className="font-mono text-xs">{status.peer_worker.current_job_id || '—'}</dd>
              {status.peer_worker.last_error && (
                <>
                  <dt className="text-content-muted">Last error</dt>
                  <dd className="text-rose-400 text-xs">{status.peer_worker.last_error}</dd>
                </>
              )}
            </dl>
          )}
        </Card>
      )}
    </div>
  )
}
