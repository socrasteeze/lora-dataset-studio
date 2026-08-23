// Contract for the release-notes generator (frontend/scripts/releaseNotes.mjs).
//
// The bug this guards: three releases shipped in one day with a body containing
// the 747-character preamble and NOTHING else, because `gh --generate-notes`
// builds "What's Changed" from merged pull requests and this repo has none.
// Nothing failed, nothing warned. So there are two contracts here: the notes
// carry the What's-new entries added since the previous tag, and a release that
// announces nothing is never silent about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIds,
  newEntries,
  renderNotes,
  extractCredits,
  emptySignal,
  screenshotUrl,
  REPO_URL,
  MAX_BODY_CHARS,
} from '../scripts/releaseNotes.mjs';
import { WHATS_NEW } from '../src/whatsNew.js';

const PREVIOUS_SOURCE = `
export const WHATS_NEW = [
  {
    id: '2026-07-26-old-thing',
    date: '2026-07-26',
    title: 'Old thing',
    blurb: 'Shipped last time.',
  },
];
`;

const CURRENT = [
  { id: '2026-07-27-shiny', date: '2026-07-27', title: 'Shiny new thing',
    blurb: 'You get a shiny thing. Reported by somebody (Discord).', to: '/settings/engines' },
  { id: '2026-07-27-quiet-fix', date: '2026-07-27', title: 'Quiet fix',
    blurb: 'Stop no longer hangs.' },
  { id: '2026-07-26-old-thing', date: '2026-07-26', title: 'Old thing',
    blurb: 'Shipped last time.' },
];

// ── Which entries belong to this release ─────────────────────────────────────

test('extractIds reads every entry id out of a historical whatsNew.js source', () => {
  assert.deepEqual([...extractIds(PREVIOUS_SOURCE)], ['2026-07-26-old-thing']);
});

test('extractIds agrees with the live module (same scan whatsNew.test.js pins)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/whatsNew.js', import.meta.url), 'utf8');
  assert.equal(extractIds(src).size, WHATS_NEW.length);
});

test('only entries absent from the previous tag land in the release', () => {
  const entries = newEntries(CURRENT, extractIds(PREVIOUS_SOURCE));
  assert.deepEqual(entries.map((e) => e.id), ['2026-07-27-shiny', '2026-07-27-quiet-fix']);
});

// ── The body actually contains the news ──────────────────────────────────────

test('the rendered body carries the preamble AND every new entry', () => {
  const entries = newEntries(CURRENT, extractIds(PREVIOUS_SOURCE));
  const body = renderNotes({
    preamble: '> two ways to install', tag: 'v2026.07.28', previousTag: 'v2026.07.26.2', entries,
  });

  assert.match(body, /^> two ways to install/);
  assert.match(body, /## 🎁 What's new in v2026\.07\.28/);
  assert.match(body, /### Shiny new thing/);
  assert.match(body, /You get a shiny thing/);
  assert.match(body, /### Quiet fix/);
  assert.match(body, /Stop no longer hangs\./);
  // The regression itself: a body that is preamble-only is what shipped.
  assert.ok(body.length > '> two ways to install'.length + 200, 'body is more than the preamble');
  // Entries already shipped never come back.
  assert.doesNotMatch(body, /Old thing/);
});

test('in-app `to:` targets are dropped — they are dead links on a GitHub page', () => {
  const body = renderNotes({ tag: 'v1', previousTag: 'v0', entries: CURRENT });
  assert.doesNotMatch(body, /\/settings\/engines/);
});

test('contributor credits survive, in the blurb and lifted into a Thanks line', () => {
  const entries = newEntries(CURRENT, extractIds(PREVIOUS_SOURCE));
  assert.deepEqual(extractCredits(entries), ['somebody (Discord)']);
  // The feed credits people in several phrasings; all of them are lifted.
  assert.deepEqual(
    extractCredits([
      { blurb: 'Suggested by alice (Reddit).' },
      { blurb: 'It crawls for hours. Thanks to bob (GitHub) for asking.' },
      { blurb: 'Reported by alice (Reddit) again — deduplicated.' },
      { blurb: 'No credit here at all.' },
    ]),
    ['alice (Reddit)', 'bob (GitHub)'],
  );
  const body = renderNotes({ tag: 'v1', previousTag: 'v0', entries });
  assert.match(body, /Reported by somebody \(Discord\)/);   // still in the prose
  assert.match(body, /\*\*Thanks to somebody \(Discord\)\*\*/);
});

test('the compare link replaces what --generate-notes used to contribute', () => {
  const body = renderNotes({ tag: 'v2026.07.28', previousTag: 'v2026.07.26.2', entries: CURRENT });
  assert.match(body, new RegExp(`${REPO_URL}/compare/v2026\\.07\\.26\\.2\\.\\.\\.v2026\\.07\\.28`));
  assert.doesNotMatch(body, /What's Changed/); // gh's empty PR heading is gone
});

// ── Silence is the defect ────────────────────────────────────────────────────

test('a release announcing nothing fails loudly instead of shipping empty', () => {
  const signal = emptySignal({ entries: [], tag: 'v2026.07.29', previousTag: 'v2026.07.28.2' });
  assert.ok(signal, 'an empty release must produce a signal');
  assert.equal(signal.severity, 'error');
  assert.notEqual(signal.exitCode, 0);
  assert.match(signal.annotation, /^::error /);
  assert.match(signal.message, /\[no-notes\]/); // tells the operator the way out
});

test('a deliberate plumbing release warns instead of failing, and still publishes', () => {
  const signal = emptySignal({
    entries: [], allowEmpty: true, tag: 'v2026.07.29', previousTag: 'v2026.07.28.2',
  });
  assert.equal(signal.severity, 'warning');
  assert.equal(signal.exitCode, 0);
  assert.match(signal.annotation, /^::warning /);
});

test('a release with news says nothing at all', () => {
  assert.equal(emptySignal({ entries: [CURRENT[0]], tag: 'v1', previousTag: 'v0' }), null);
});

// A screenshot is only useful on the release page if the URL survives the trip.
// Two ways it does not: a repo-relative path (the page has no repository root,
// so it renders broken) and a `main` ref (the picture in a six-month-old release
// silently becomes the CURRENT screen — a note claiming to show what shipped,
// showing something else).
test('a screenshot is linked absolutely, and pinned to the released tag', () => {
  const url = screenshotUrl('v2026.08.22', 'docs/screenshots/canvas/board.png');
  assert.ok(url.startsWith('https://'), url);
  assert.ok(url.includes('/raw/v2026.08.22/'), `pinned to the tag: ${url}`);
  assert.doesNotMatch(url, /\/raw\/main\//, url);
  assert.ok(url.endsWith('docs/screenshots/canvas/board.png'), url);
});

// ── The wiring, not just the rendering ───────────────────────────────────────
// v2026.08.23 shipped imageless with the mechanism landed AND the screenshot
// committed: nobody had written the one `image:` line that joins them, and
// nothing failed. Both directions of the pairing are contracts now — a file
// with no entry is a picture that will never be seen, and an entry pointing at
// a missing file is a broken image on the release page.

test('every release screenshot on disk is referenced by an entry', async () => {
  const { readdirSync, existsSync } = await import('node:fs');
  const dir = new URL('../../docs/screenshots/release/', import.meta.url);
  if (!existsSync(dir)) return;   // no screenshots yet — nothing to orphan
  const referenced = new Set(WHATS_NEW.map((e) => e.image).filter(Boolean));
  for (const f of readdirSync(dir)) {
    assert.ok(referenced.has(`docs/screenshots/release/${f}`),
      `docs/screenshots/release/${f} is referenced by no What's-new entry — `
      + 'a picture nobody wired is a picture nobody will ever see');
  }
});

test('every screenshot an entry references exists in the tree', async () => {
  const { existsSync } = await import('node:fs');
  for (const e of WHATS_NEW) {
    if (!e.image) continue;
    assert.ok(existsSync(new URL(`../../${e.image}`, import.meta.url)),
      `${e.id} references ${e.image}, which does not exist — a broken image on the release page`);
  }
});

test('an entry with a screenshot renders it under its prose; one without changes nothing', () => {
  const withShot = renderNotes({
    tag: 'v1', previousTag: 'v0',
    entries: [{ id: 'a', date: '2026-01-01', title: 'A change', blurb: 'What it does.',
      image: 'docs/screenshots/canvas/board.png' }],
  });
  // Order matters: the text explains, the picture shows.
  assert.ok(withShot.indexOf('What it does.') < withShot.indexOf('!['), withShot);
  assert.match(withShot, /!\[A change\]\(https:\/\/[^)]*\/raw\/v1\/docs\/screenshots\/canvas\/board\.png\)/);

  const without = renderNotes({
    tag: 'v1', previousTag: 'v0',
    entries: [{ id: 'a', date: '2026-01-01', title: 'A change', blurb: 'What it does.' }],
  });
  assert.doesNotMatch(without, /!\[/, 'an entry with no image must add no markup');
});


// ── The first release, which has nothing to diff against ─────────────────────
// A repository that has never published one used to be the single case this
// generator could not serve: release.yml threw before reaching it. A fork is
// the ordinary way to arrive here.

test('a first release renders without a previous tag to compare against', () => {
  const body = renderNotes({ tag: 'v2026.08.03', previousTag: null, entries: CURRENT });
  for (const entry of CURRENT) assert.match(body, new RegExp(entry.title.slice(0, 20)));
  // No compare link: there is no earlier tag on the remote for it to resolve,
  // and a /compare/null...v2026.08.03 URL is a 404 in the release body.
  assert.doesNotMatch(body, /\/compare\//);
});

test('an empty first release still refuses, and names the tag not a null', () => {
  const signal = emptySignal({ entries: [], tag: 'v2026.08.03', previousTag: null });
  assert.ok(signal, 'an empty first release is still an empty release');
  assert.equal(signal.severity, 'error');
  assert.match(signal.message, /in v2026\.08\.03/);
  assert.doesNotMatch(signal.message, /null|undefined/);
});

// ── GitHub's body limit ──────────────────────────────────────────────────────
// A body over 125 000 characters is refused with a flat HTTP 422, and it is
// refused at the LAST step — after the ZIP is built and uploaded — so the whole
// release fails and leaves a tag with no release behind it. The fork's first
// release hit this at 239 853 characters.

const BULK = Array.from({ length: 400 }, (_, i) => ({
  id: `bulk-${i}`,
  title: `Entry number ${i}`,
  blurb: `${'x'.repeat(600)} ${i}`,
}));

test('a body too large for GitHub is trimmed instead of being refused by it', () => {
  const body = renderNotes({ tag: 'v1', previousTag: null, entries: BULK });
  assert.ok(body.length <= MAX_BODY_CHARS,
    `body is ${body.length} chars, over GitHub's ${MAX_BODY_CHARS} limit`);
});

test('a trimmed body says how much it dropped rather than looking complete', () => {
  const body = renderNotes({ tag: 'v1', previousTag: null, entries: BULK });
  const kept = [...body.matchAll(/^### /gm)].length;
  assert.ok(kept > 0 && kept < BULK.length, 'some entries kept, some dropped');
  assert.match(body, new RegExp(`and ${BULK.length - kept} earlier entr`));
  assert.match(body, /CHANGELOG\.md/);
});

// Where the two features above MEET, and where they auto-merged wrong once:
// `image:` renders ~120 characters of absolute URL per entry, and the trim
// budgets entries by their prose. Admitted on the prose alone, a body full of
// screenshots goes back over the ceiling the trim exists to keep it under —
// which is the flat 422, after the ZIP is uploaded. So the picture is measured
// as part of its entry.
test('a screenshot is counted against the body budget, not added after it', () => {
  const shot = 'docs/screenshots/release/generation-queue-dock.png';
  const shots = Array.from({ length: 400 }, (_, i) => ({
    id: `shot-${i}`, title: `Entry number ${i}`, blurb: `${'x'.repeat(600)} ${i}`, image: shot,
  }));
  const body = renderNotes({ tag: 'v1', previousTag: null, entries: shots });
  assert.ok(body.length <= MAX_BODY_CHARS,
    `body is ${body.length} chars, over GitHub's ${MAX_BODY_CHARS} limit`);
  // …and the pictures really are in there, so the guard is not passing by
  // rendering nothing.
  assert.ok([...body.matchAll(/^!\[/gm)].length > 0, 'no screenshot rendered at all');
  assert.equal([...body.matchAll(/^### /gm)].length, [...body.matchAll(/^!\[/gm)].length,
    'every kept entry keeps its picture');
});

test('a body that already fits is left exactly as it was', () => {
  const body = renderNotes({ tag: 'v1', previousTag: 'v0', entries: CURRENT });
  assert.doesNotMatch(body, /trimmed to fit/);
  assert.equal([...body.matchAll(/^### /gm)].length, CURRENT.length);
});

test('credits name only contributors whose entry actually survived the trim', () => {
  const credited = { id: 'c', title: 'Kept', blurb: 'Fixed by Someone (GitHub).' };
  const hidden = { id: 'h', title: 'Dropped', blurb: `${'y'.repeat(300)} Reported by Ghost (Discord).` };
  // A tiny budget keeps the first entry and drops the rest.
  const body = renderNotes({
    tag: 'v1', previousTag: null, entries: [credited, ...Array(50).fill(hidden)], budget: 400,
  });
  assert.match(body, /Someone \(GitHub\)/);
  assert.doesNotMatch(body, /Ghost \(Discord\)/,
    'thanking someone for an entry the reader cannot see is worse than not thanking them');
});
