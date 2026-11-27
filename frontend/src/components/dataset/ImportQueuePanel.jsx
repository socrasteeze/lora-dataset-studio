import { btnClass } from '../common/controls';

export default function ImportQueuePanel({ queue }) {
  if (!queue) return null;
  const { session, running, error, refused } = queue;
  if (!session && !running && !error && !refused.length) return null;
  const done = session?.items.filter((item) => item.result).length || 0;
  const total = session?.items.length || 0;
  const failed = session?.items.filter((item) => item.result?.failed).length || 0;
  const imported = session?.items.reduce((n, item) => n + (item.result?.imported || 0), 0) || 0;
  const duplicates = session?.items.reduce((n, item) => n + (item.result?.duplicates || 0), 0) || 0;
  const small = session?.items.reduce((n, item) => n + (item.result?.small || 0), 0) || 0;
  const complete = total > 0 && done === total;
  const button = btnClass({ size: 'sm' });
  return <section aria-label="Photo import" className="lds-section py-3">
    <p role="status" className="text-sm font-semibold text-content">
      {running ? (session ? 'Importing' : 'Preparing Upload') : complete ? 'Import Complete' : 'Import Paused'}
      {session && ` · ${done}/${total} processed · ${imported} imported`}
      {duplicates > 0 && ` · ${duplicates} duplicates skipped`}
    </p>
    {total > 0 && !complete && <progress className="my-2 w-full" value={done} max={total} aria-label="Import progress" />}
    {!complete && !running && session && <p className="text-xs text-content-muted">Resume to upload pending files from this browser.</p>}
    {failed > 0 && <p className="text-sm text-amber-300">
      {failed} refused. Use JPEG, PNG, WebP, BMP, HEIC or AVIF. Resize large files or raise the Image size budget.
    </p>}
    {failed > 0 && <ul aria-label="Refused files" className="max-h-32 overflow-auto text-xs text-amber-300">
      {session.items.filter((item) => item.result?.failed).map((item) => <li key={item.key}>{item.name}</li>)}
    </ul>}
    {small > 0 && <p className="text-xs text-amber-300">{small} {small === 1 ? 'image' : 'images'} below 768 px.</p>}
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {refused.length > 0 && <ul aria-label="Unsupported files" className="max-h-32 overflow-auto text-xs text-amber-300">
      {refused.map((item, index) => <li key={index}>{item.name}: {item.reason}</li>)}
    </ul>}
    <div className="mt-2 grid grid-flow-col auto-cols-fr gap-2">
      {running ? <button type="button" className={button} onClick={queue.pause} title="Pause after this file.">Pause</button>
        : session && !complete && <button type="button" className={button} onClick={queue.resume}>Resume</button>}
      {session && <button type="button" disabled={running} className={button} onClick={queue.cancel}>
        {complete ? 'Dismiss' : 'Cancel Remaining'}
      </button>}
    </div>
  </section>;
}
