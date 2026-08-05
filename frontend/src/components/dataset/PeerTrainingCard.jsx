/* A run happening on ANOTHER machine, and the button that stops it.
 *
 * Separate from the local training status on purpose. `/api/dataset/train/status`
 * reports the single run the machine-wide `training_in_progress` flag describes,
 * and this lane never sets that flag — a run on another box must not make this
 * one refuse generation and bank GPU passes for hours. So it has its own row,
 * its own endpoint, and its own card.
 *
 * `enabled` is what stops this being a permanent timer on an install that has
 * never configured the feature: the common case is no address set and no peer
 * run possible, and a 5-second poll of two database queries for that would be
 * 720 requests an hour to be told "no" — the same waste the peer heartbeat was
 * paced down for. It still checks ONCE on mount either way, so a run that
 * outlived the setting being cleared is not invisible.
 */
import { useCallback, useEffect, useState } from 'react';
import { isActiveRun, peerRunLine } from './trainingMachines.js';

const POLL_MS = 5000;

export default function PeerTrainingCard({ datasetId, postJson, onChange, enabled = false }) {
  const [runs, setRuns] = useState([]);
  const [stopping, setStopping] = useState(null);
  // Failures stay in the list for an hour so they cannot scroll past unseen.
  // Once read, they are noise — dismissible here rather than server-side,
  // because "I have read it" is a property of this browser, not of the run.
  const [dismissed, setDismissed] = useState(() => new Set());

  const load = useCallback(async () => {
    if (!datasetId) return;
    try {
      const r = await fetch(`/api/training/peer-runs?dataset_id=${datasetId}`,
        { credentials: 'include' });
      if (!r.ok) return;          // 404 on an older backend — render nothing
      const d = await r.json();
      setRuns(d.runs || []);
      onChange?.(d);
    } catch { /* keep the last truthful list */ }
  }, [datasetId, onChange]);

  useEffect(() => {
    load();
    if (!enabled) return undefined;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, enabled]);

  const shown = runs.filter((run) => !dismissed.has(run.id));
  if (shown.length === 0) return null;
  // Red only when there is nothing else here: an hour-old failure sitting
  // beside a run that is training right now must not paint the live one as
  // broken. That row keeps its own ⚠ either way.
  const allOver = shown.every((run) => !isActiveRun(run));

  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${allOver
      ? 'border-red-400/40 bg-red-500/10' : 'border-indigo-400/40 bg-indigo-500/10'}`}>
      {shown.map((run) => (
        <div key={run.id} className="flex flex-wrap items-center gap-2">
          <span aria-hidden>{isActiveRun(run) ? '🛰' : '⚠'}</span>
          <span className="text-content">{peerRunLine(run)}</span>
          {!isActiveRun(run) && (
            <button type="button"
              title="Dismiss this notice. The run itself is already over."
              onClick={() => setDismissed((prev) => new Set(prev).add(run.id))}
              aria-label="Dismiss this training failure"
              className="ml-auto px-2 py-1 rounded-lg border border-border text-content-muted text-[0.75rem]">
              ✕ Dismiss
            </button>
          )}
          {isActiveRun(run) && (
            <button type="button"
              disabled={stopping === run.id || run.stop_requested}
              title={'Ends the run on that machine. The checkpoints it has already '
                + 'saved are copied back here before it closes.'}
              onClick={async () => {
                const where = run.machine_label || run.gpu_ids;
                if (!window.confirm(`Stop this training run on ${where}?\n\n`
                  + 'The run ends there. Every checkpoint it has already saved is '
                  + 'copied back here, and stays testable.')) return;
                setStopping(run.id);
                try {
                  await postJson(`/api/training/peer-runs/${run.id}/stop`);
                } finally {
                  setStopping(null);
                  load();
                }
              }}
              className="ml-auto px-3 py-1 rounded-lg bg-red-600/80 text-white text-[0.75rem] font-semibold disabled:opacity-40">
              {run.stop_requested ? 'Stopping…' : '⏹ Stop'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
