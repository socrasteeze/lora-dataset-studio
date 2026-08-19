import { useCallback, useEffect, useState } from 'react'
import { apiFetch, postJson } from '../../api/fetchClient'
import { useToast } from '../common/Toast'
import { INPUT_CLASS, Card } from './primitives'
import ResetToDefault from './ResetToDefault'
import { peerVersionNote } from './peerVersionNote.js'

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
  // Remote ComfyUI API backends — the lighter model, no second install.
  const [backends, setBackends] = useState(null)
  const [backendName, setBackendName] = useState('')
  const [backendUrl, setBackendUrl] = useState('')
  const [backendTest, setBackendTest] = useState(null)
  // Live worker/peer state from the poll-safe endpoint (see the effect below).
  const [live, setLive] = useState(null)

  const refresh = useCallback(async () => {
    try {
      /* background: the catch below already decided this failure is not news,
         but apiFetch toasts "Server error. Please try again later." on any 5xx
         BEFORE the caller ever sees it — so opening this tab against a sick
         /status shouted at the user over a section that renders fine from
         config. The flag routes it to the offline indicator instead. The
         buttons below (mint / join / revoke / rename) keep their own toasts:
         a failure the user ASKED for still speaks. */
      setStatus(await apiFetch('/api/cluster/status', { background: true }))
    } catch (e) {
      /* section still usable offline from config */
    }
    try {
      const d = await apiFetch('/api/cluster/backends')
      setBackends(d.backends || [])
    } catch (e) {
      setBackends([])
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  // Live half, on its own cheap endpoint. /status probes ComfyUI and Ollama over
  // HTTP (capabilities.probe), so it must NOT be polled — but without any poll
  // this card sat frozen for the whole length of a remote pass, which is exactly
  // when someone opens it. /activity reads worker state only.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const d = await apiFetch('/api/cluster/activity', { background: true })
        if (alive) setLive(d)
      } catch { /* keep the last-known state; a blip must not blank the card */ }
    }
    tick()
    const t = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])
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

  const testBackendUrl = async () => {
    setBackendTest('testing')
    try {
      const d = await postJson('/api/cluster/backends/test', { url: backendUrl.trim() })
      setBackendTest(d.online ? 'online' : 'offline')
    } catch (e) {
      setBackendTest('offline')
    }
  }

  const addApiBackend = async () => {
    setBusy(true)
    try {
      const d = await postJson('/api/cluster/backends',
        { name: backendName.trim(), url: backendUrl.trim() })
      if (d.error) { toast.error(d.error); return }
      toast.success(d.online
        ? 'Backend added — it appears in the Run on picker'
        : 'Backend added, but it is not answering — check the URL and --listen')
      setBackendName(''); setBackendUrl(''); setBackendTest(null)
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Could not add backend')
    } finally {
      setBusy(false)
    }
  }

  const removeApiBackend = async (id) => {
    if (!window.confirm('Remove this backend? Its pending jobs will fail.')) return
    try {
      await postJson(`/api/cluster/backends/${id}/remove`, {})
      toast.success('Backend removed')
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Remove failed')
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Role">
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
            Name
          </label>
          <input id="cluster-device-name" type="text"
            value={config.cluster?.device_name ?? ''}
            onChange={(e) => setField('cluster', 'device_name', e.target.value)}
            placeholder="e.g. Desktop 5090 / G18 laptop"
            className={`${INPUT_CLASS} max-w-md`} />
          <ResetToDefault label="Name" section="cluster" field="device_name"
            config={config} configDefaults={configDefaults} setField={setField} />
        </div>
        {status?.node_id && (
          <p className="mt-2 font-mono text-[11px] text-content-subtle">
            node id · {status.node_id}
          </p>
        )}
      </Card>

      {role !== 'peer' && (
        <Card id="remote-comfyui-backends" title="Remote ComfyUI backends"
          help="The lighter way to rent a GPU: the other box runs ONLY ComfyUI (started with --listen), no second app install. This machine sends inputs and fetches results over ComfyUI's own API. Works in any role, Primary account not needed.">
          {/* The two remote models look alike in the picker and are not
              interchangeable — one runs bank passes, the other cannot. Say so
              HERE, where the user is choosing between them. */}
          <p className="mb-3 text-xs text-content-muted">
            <strong className="text-content">Generation only.</strong> Bank passes need a compute
            peer. No auth — trusted network or Tailscale only.
          </p>
          {backends === null ? (
            <p className="text-sm text-content-muted">Loading…</p>
          ) : backends.length === 0 ? (
            <p className="text-sm text-content-muted">
              No backends yet. Start ComfyUI on the other machine with
              <code className="mx-1 rounded bg-surface-raised px-1">--listen</code>
              and add its URL below.
            </p>
          ) : (
            <ul className="space-y-1">
              {backends.map((b) => (
                <li key={b.id} className="flex items-center gap-3 text-sm">
                  <span className={b.online ? 'text-emerald-400' : 'text-content-subtle'}>
                    {b.online ? '●' : '○'}
                  </span>
                  <span className="font-medium text-content">{b.name}</span>
                  <span className="font-mono text-xs text-content-muted">{b.url}</span>
                  {!b.online && <span className="text-xs text-amber-300">offline</span>}
                  <button type="button" onClick={() => removeApiBackend(b.id)}
                    className="ml-auto text-xs text-rose-400 hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="backend-name" className="block text-xs text-content-muted">Name</label>
              <input id="backend-name" value={backendName}
                onChange={(e) => setBackendName(e.target.value)}
                className={`${INPUT_CLASS} max-w-[11rem]`} placeholder="Laptop 4090" />
            </div>
            <div>
              <label htmlFor="backend-url" className="block text-xs text-content-muted">ComfyUI URL</label>
              <input id="backend-url" value={backendUrl}
                onChange={(e) => { setBackendUrl(e.target.value); setBackendTest(null) }}
                className={`${INPUT_CLASS} max-w-[16rem]`} placeholder="http://laptop:8188" />
            </div>
            <button type="button" disabled={busy || !backendUrl.trim()} onClick={testBackendUrl}
              className="rounded-md border border-border-strong px-3 py-2 text-sm text-content disabled:opacity-50">
              Test
            </button>
            <button type="button" disabled={busy || !backendUrl.trim()} onClick={addApiBackend}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Add backend
            </button>
            {backendTest === 'testing' && <span className="text-xs text-content-muted">testing…</span>}
            {backendTest === 'online' && <span className="text-xs text-emerald-400">✓ reachable</span>}
            {backendTest === 'offline' && <span className="text-xs text-rose-400">✕ not answering</span>}
          </div>
        </Card>
      )}

      {role === 'primary' && (
        <Card title="Compute peers"
          help="Generate a join token on this Primary, then paste it into the peer install (Settings → Devices → Peer). Tailscale MagicDNS hostnames work best.">
          {/* The counterpart of the note on the backends card — the two are not
              interchangeable and the picker cannot show that on one line. */}
          <p className="mb-3 text-xs text-content-muted">
            <strong className="text-content">Full app on the other machine.</strong> Score, Faces,
            Framing, Watermarks and Captions can run there. Scan and auto-reject stay here.
          </p>
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
            {(status?.peers || []).map((p0) => {
              // Merge the live row over the mount-time one: name/capabilities
              // come from /status, online+busy from the 5 s /activity poll.
              const l = (live?.peers || []).find((x) => x.id === p0.id)
              const p = l ? { ...p0, online: l.online, busy: l.busy } : p0
              return (
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
                {/* Only ever shown for an explicit disagreement — see
                    peerVersionNote.js for why silence is the default. */}
                {peerVersionNote(p.capabilities, status?.local_capabilities) && (
                  <span className="text-xs text-amber-400"
                    title="A peer on a different build still works; the two just disagree.">
                    {peerVersionNote(p.capabilities, status?.local_capabilities)}
                  </span>
                )}
                <button type="button" onClick={() => revoke(p.id)}
                  className="text-xs text-rose-400 hover:underline">Revoke</button>
              </li>
              )
            })}
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
            {/* The trust here points one way and the user is the only one who can
                judge it, so it is stated at the moment of the decision — not in a
                doc they will read afterwards. */}
            <p className="text-[0.8125rem] text-amber-300/90">
              ⚠️ Joining lets that Primary start GPU work on this machine. This box only ever
              runs its own installed scripts with its own Python — never a file the Primary
              names — but <strong>join a Primary you control</strong>. Revoke from the Primary’s
              Devices card at any time.
            </p>
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
                {(live?.connected ?? status.peer_worker.connected)
                  ? ' · connected' : ' · not connected'}
                {live?.busy && <span className="text-emerald-300"> · working now</span>}
              </dd>
              <dt className="text-content-muted">Current job</dt>
              <dd className="text-xs">
                {live?.busy
                  ? `${live.kind || 'job'}${live.phase ? ` · ${live.phase}` : ''}`
                  : '—'}
                {live?.current_job_id && (
                  <span className="ml-1 font-mono text-content-subtle">
                    ({String(live.current_job_id).slice(0, 8)})
                  </span>
                )}
              </dd>
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
