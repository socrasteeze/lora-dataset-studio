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
  for (const route of ['faces', 'score', 'framing']) {
    assert.ok(ws.includes('/' + route + '`, on())'),
      `${route} still posts {} — it will run here whatever the picker says`);
  }
  assert.match(ws, /\/caption`, \{[\s\S]{0,10}\.\.\.on\(\),/);
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
