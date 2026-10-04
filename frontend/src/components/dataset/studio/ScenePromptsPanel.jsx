import { useState } from 'react';
import { apiFetch } from '../../../api/fetchClient';
import { useToast } from '../../common/Toast';
import { HelpBadge } from '../../../help/HelpMode';
import { btnClass, btnShape, fieldClass } from '../../common/controls';
import { SCENE_SOURCES, joinScenePrompt, sceneSource, sceneThumbUrl,
  toggleSceneIndex } from './scenePrompts';

/* 🎬 Scenes — a bank's OR a dataset's captions imported as ordered prompt passes.
 *
 * Load the captions IN ORDER (one per captioned image), tick the ones to run:
 * each ticked scene is one pass of the 📝 prompt axis, with the run's own
 * checkpoints and settings unchanged. State lives in RunSetupPanel next to the
 * history batch, and like it is deliberately NOT persisted — a scene selection
 * is the intention of ONE launch.
 *
 * TWO sources, one panel. A bank is the pile you triage; a dataset is what you
 * KEPT and captioned — the sequence people actually want to replay is as often
 * the second as the first, and offering only the bank meant exporting a dataset
 * back into a bank to reach a feature that was already there. Everything that
 * differs between them (the list route, the scenes route, how a thumbnail is
 * addressed) lives in scenePrompts.js; this file has one code path.
 *
 * The 🎲 shortcut above stays the random single draw; this list is for when the
 * order IS the point (a storyboard, a shoot, a chapter).
 */
export default function ScenePromptsPanel({ value, onChange }) {
  const toast = useToast();
  const [kind, setKind] = useState('bank');
  // { bank: [...], dataset: [...] } — fetched once per source, on first open of
  // that tab. A key absent means "never asked", which is what shows "Loading…".
  const [lists, setLists] = useState({});
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const { source, scenes, picked } = value;
  const src = SCENE_SOURCES.find((s) => s.kind === kind) || SCENE_SOURCES[0];
  const options = lists[kind];

  const openList = (k) => {
    const conf = SCENE_SOURCES.find((s) => s.kind === k);
    if (!conf || lists[k] !== undefined) return;
    apiFetch(conf.listUrl)
      .then((d) => setLists((cur) => ({ ...cur, [k]: d[conf.listKey] || [] })))
      .catch(() => {
        setLists((cur) => ({ ...cur, [k]: [] }));
        toast.error(`Could not list the ${k === 'dataset' ? 'datasets' : 'image banks'}`);
      });
  };

  const pickKind = (k) => {
    setKind(k);
    setSourceId('');          // an id from the other table would load the wrong thing
    openList(k);
  };

  const load = async () => {
    if (!sourceId) return;
    setBusy(true);
    try {
      const path = kind === 'dataset'
        ? `/api/dataset/${sourceId}/scenes`
        : `/api/bank/${sourceId}/scenes`;
      const d = await apiFetch(path);
      // extras resets WITH picked: both are keyed by index into a list that a
      // reload may have reordered, and stale text on the wrong scene would be
      // worse than retyping it.
      onChange({ source: sceneSource(kind, d), scenes: d.scenes || [], picked: [], extras: {} });
      const skipped = d.skipped?.no_caption || 0;
      toast.success(`${(d.scenes || []).length} scene(s) loaded in order`
        + (skipped ? ` — ${skipped} image(s) without a caption skipped` : ''));
    } catch (e) {
      toast.error(e.message || 'Could not load the scenes');
    } finally { setBusy(false); }
  };

  const nPicked = picked.length;
  return (
    <details className="lds-section open:pb-2" onToggle={(e) => { if (e.currentTarget.open) openList(kind); }}>
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-xs text-content font-semibold">
        🎬 Scenes from a bank or dataset
        <HelpBadge topic="studio-scene-prompts" />
        <span className="ml-2 font-normal text-content-subtle text-2xs">
          {scenes.length
            ? `${nPicked} of ${scenes.length} scene(s) picked from “${source?.name || 'a source'}” — one pass each, in order`
            : 'run a bank’s or a dataset’s captions in order — one pass per ticked scene'}
        </span>
      </summary>
      <div className="px-2.5 pt-1 flex flex-col gap-1.5">
        {/* Which table the dropdown below is listing. Two buttons rather than a
            second dropdown: the choice changes what the next control MEANS. */}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Where the scenes come from">
          {SCENE_SOURCES.map((s) => (
            <button key={s.kind} type="button" onClick={() => pickKind(s.kind)}
              aria-pressed={kind === s.kind}
              className={`${btnShape({ size: 'sm' })} border font-semibold `
                + (kind === s.kind
                  ? 'border-primary/50 bg-primary/20 text-white'
                  : 'border-border bg-app/40 text-content-muted hover:bg-surface-raised')}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}
            aria-label={`${src.label.replace(/^\S+\s/, '')} to load scenes from`}
            className={`${fieldClass({ size: 'sm' })} max-w-56`}>
            <option value="">
              {options === undefined ? 'Loading' : (options.length ? src.pick : src.empty)}
            </option>
            {(options || []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button type="button" onClick={load} disabled={!sourceId || busy}
            className={`${btnShape({ size: 'sm' })} bg-gradient-primary font-semibold text-gray-950`}>
            {busy ? 'Loading' : scenes.length ? '⟳ Reload' : '⬇ Load scenes'}
          </button>
          {scenes.length > 0 && (
            <>
              <button type="button"
                onClick={() => onChange({ ...value, picked: scenes.map((_, i) => i) })}
                className={btnClass({ size: 'sm' })}>
                Select all
              </button>
              <button type="button" onClick={() => onChange({ ...value, picked: [] })}
                className={btnClass({ size: 'sm' })}>
                None
              </button>
            </>
          )}
        </div>
        {scenes.length > 0 && (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
            {scenes.map((s, i) => {
              const on = picked.includes(i);
              const thumb = sceneThumbUrl(source, s);
              const extra = (value.extras || {})[i] || '';
              return (
                /* A <div> around the toggle, not a lone <button>: the ✏️ input
                   below cannot legally live INSIDE a button, and it appeared the
                   day scenes learned a per-card custom prompt. */
                <div key={`${i}-${s.label}`}
                  className={'flex flex-col rounded-lg border transition-colors '
                    + (on ? 'border-primary/50 bg-primary/20 ring-1 ring-primary/30'
                      : 'border-border bg-app/40 hover:bg-surface-raised')}>
                  <button type="button"
                    onClick={() => onChange({ ...value, picked: toggleSceneIndex(picked, i) })}
                    aria-pressed={on} title={joinScenePrompt(s.prompt, extra)}
                    className={'flex items-start gap-1.5 px-1.5 py-1 text-left text-2xs '
                      + (on ? 'text-white' : 'text-content-muted')}>
                    {thumb && (
                      <img src={thumb}
                        alt="" loading="lazy" draggable={false}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        className="h-16 w-12 shrink-0 rounded border border-border bg-app/60 object-cover object-top" />
                    )}
                    <span className="shrink-0 font-semibold tabular-nums text-content-subtle">{i + 1}.</span>
                    <span className="min-w-0 leading-tight line-clamp-3">{s.prompt}</span>
                    {on && <span className="ml-auto shrink-0 text-indigo-300" aria-hidden="true">✓</span>}
                  </button>
                  {/* ✏️ Per-scene custom prompt — appended to this scene's caption
                      at launch (joinScenePrompt). Offered on PICKED scenes: those
                      are the ones that will generate, and fifty inputs on fifty
                      unticked rows would bury the list. The text survives an
                      untick (extras is keyed by index, independent of picked). */}
                  {on && (
                    <input type="text" value={extra}
                      onChange={(e) => onChange({
                        ...value,
                        extras: { ...(value.extras || {}), [i]: e.target.value },
                      })}
                      placeholder="✏️ Custom prompt added to this scene (optional)"
                      aria-label={`Custom prompt appended to scene ${i + 1}`}
                      className={`${fieldClass({ size: 'sm' })} mx-1.5 mb-1 placeholder:text-content-subtle`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
