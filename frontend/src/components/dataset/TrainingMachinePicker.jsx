/* "Train on" — this machine, or a GPU on one of the ai-toolkit's machines.
 *
 * This app never talks to the far machine. It submits to the ai-toolkit at
 * `aitoolkit.url`, and THAT instance owns the hop: it stages the dataset over,
 * starts the job on the chosen GPU and mirrors the log, samples and checkpoints
 * back. One implementation of the remote hop rather than two — this app used to
 * carry its own and it was deleted, because nothing could reach it and a Stop
 * could not stop it.
 *
 * Invisible until an address is set, so a user who does not train elsewhere
 * never sees a control they cannot use. The rules about WHICH machines are
 * offered live in `trainingMachines.js`, where they can be tested.
 */
import { useCallback, useEffect, useState } from 'react';
import { HelpBadge } from '../../help/HelpMode';
import {
  LOCAL_MACHINE, machineNote, machineOption, reconcileMachine, remoteMachines,
} from './trainingMachines.js';

/* A machine switched on mid-session should not stay invisible until a reload,
   and a machine switched off should not stay pickable. Slow on purpose: each
   poll makes the ai-toolkit probe every machine it has. */
const REFRESH_MS = 60000;

export default function TrainingMachinePicker({ value, onChange, onConfigured,
                                                disabled = false, className = '' }) {
  const [state, setState] = useState(null);   // null = not loaded yet

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/training/machines', { credentials: 'include' });
      if (!r.ok) return;            // 404 on an older backend — stay invisible
      const d = await r.json();
      setState(d);
      // The run card needs to know whether this feature exists at all, and this
      // request already answers it — asking again from there would be a second
      // poll for the same fact.
      onConfigured?.(!!d.configured);
    } catch { /* keep the last truthful list */ }
  }, [onConfigured]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // What is REMEMBERED and what is OFFERABLE drift apart on their own: a peer
  // gets switched off, or removed from the ai-toolkit. Reconcile out loud, so
  // the row the user reads is the machine the launch will use.
  //
  // The list is read off `state` INSIDE the effect rather than hoisted above
  // it: `state?.machines || []` mints a new array on every render whenever the
  // key is absent, which would re-run this on every render for nothing.
  useEffect(() => {
    if (state == null) return;
    const usable = reconcileMachine(value, state.machines || []);
    if (usable !== (value || LOCAL_MACHINE)) onChange?.(usable);
  }, [state, value, onChange]);

  if (state == null || !state.configured) return null;

  const machines = state.machines || [];
  const offered = remoteMachines(machines);
  const note = machineNote({ ...state, machines });
  const current = reconcileMachine(value, machines);

  return (
    <label className={`inline-flex items-center gap-2 text-[0.75rem] ${className}`}>
      <span className="text-content-muted whitespace-nowrap">Train on</span>
      <select
        value={current}
        disabled={disabled || offered.length === 0}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label="Machine to train on"
        title={'A run sent to another machine starts fresh there — this app does not '
          + 'send previous checkpoints. Its log, samples and checkpoints are mirrored '
          + 'back here as it goes.'}
        className="px-2 py-1 rounded-lg border border-border bg-surface text-content text-[0.75rem] max-w-[14rem] disabled:opacity-50">
        <option value={LOCAL_MACHINE}>This machine</option>
        {offered.map((m) => {
          const opt = machineOption(m);
          return <option key={opt.id} value={opt.id} disabled={opt.disabled}>{opt.label}</option>;
        })}
      </select>
      <HelpBadge topic="action-training-machine" />
      {note && <span className="text-content-subtle">{note}</span>}
    </label>
  );
}
