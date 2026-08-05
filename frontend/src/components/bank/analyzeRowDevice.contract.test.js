/* The Analyze row must honour the "Run on" pick, like Launch all does.
 *
 * The gap: Launch all → peer moved five passes off this machine, while clicking
 * those same five individually posted {} and kept every one of them on this
 * card — with nothing in the UI admitting the difference. ✨ Score and
 * 👥 Group by person even had a fully wired backend lane that nothing ever
 * exercised.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ws = fs.readFileSync(new URL('./BankWorkspace.jsx', import.meta.url), 'utf8');

test('every travelling single pass sends the chosen machine', () => {
  // 👥 Faces still has its own literal launcher — the preflight gate calls it
  // directly, bypassing the dialog when nothing needs asking — so it has to
  // carry on() on its own rather than inheriting it from anywhere.
  assert.ok(ws.includes('/faces`, on())'),
    'faces still posts {} — it will run here whatever the picker says');
  // ✨ Score and 📐 Framing no longer have their own launchers: both open the
  // shared dialog and run through the generic runPass(), which hands the body
  // to passBody() — and THAT is what spreads on() into every travelling pass
  // now, unconditionally, rather than each pass having to ask for it.
  assert.match(ws,
    /const runPass = async \(passId, run, extra = \{\}\) => \{[\s\S]{0,300}?passBody\(passId, run, extra\)/,
    'runPass no longer hands the body through passBody() — score/framing would stop carrying on()');
  assert.match(ws, /const passBody[\s\S]{0,600}?\.\.\.on\(\)/,
    'passBody() no longer spreads on() — every dialog-launched pass would run locally');
  // 🏷 Caption builds its OWN options object (engine/model/vocab/length,
  // passed as passBody's `extra`) and has to spread on() into that directly.
  assert.match(ws, /const captionRunOptions = \(\) => \(\{\s*\n\s*\.\.\.on\(\),/);
  // 'local' is folded to nothing rather than sent as a string: bank_queue had
  // to learn that lesson once already.
  assert.match(ws, /passDevice && passDevice !== 'local' \? \{ device_id: passDevice \} : \{\}/);
});

test('the row has its own picker, remembered separately from the inpaint one', () => {
  // Both render on this screen. One shared key let a ComfyUI backend picked for
  // Klein decide where a bank pass ran.
  assert.match(ws, /kind="bank-pass"/);
  assert.match(ws, /loadSavedDeviceId\('bank-pass'\)/);
  assert.match(ws, /onDevice=\{setPassDeviceObj\}/);
});

test('the buttons grey out per machine through the SAME gate as Launch all', () => {
  assert.match(ws, /import \{ stepGate \} from '\.\/passDeviceGate\.js'/);
  for (const key of ['score', 'faces', 'framing', 'caption']) {
    assert.match(ws, new RegExp(`passGate\.${key}\.ok`),
      `${key} is still gated on this machine's capabilities alone`);
  }
  // …and says which stack is missing rather than a generic "needs setup".
  assert.match(ws, /passGate\.score\.reason \|\|/);
});

test('the local-only folder probe never steals a pass assigned to another machine', () => {
  assert.match(ws,
    /const gate = async \(run, onRefusal\) => \{[\s\S]{0,500}if \(passDevice && passDevice !== 'local'\) return false[\s\S]{0,500}person-preflight/,
    'a remote person pass would still run the new local folder probe first');
});
