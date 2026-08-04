/* The picker must never offer this machine, and must never hide a machine.
 *
 * Both rules exist because of a failure the repo has already paid for once, in
 * the bank's Run-on picker: a device offered but refused by the submit route
 * turns a clear "you cannot" into a job that dies a minute later on someone
 * else's screen. Here the equivalent mistake is worse than a refusal — a bare
 * GPU index IS accepted by ai-toolkit, so offering it would quietly train on
 * the local card without setting `training_in_progress`, and generation would
 * start on top of it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isActiveRun, machineNote, machineOption, peerRunLine, reconcileMachine, remoteMachines,
} from './trainingMachines.js';

const LOCAL = { id: '0', label: 'GPU #0 · RTX 5090', available: true, remote: false };
const PEER = { id: 'workshop:0', label: 'Workshop · GPU #0', available: true, remote: true };
const OFFLINE = {
  id: 'shed:0', label: 'Shed — No answer', available: false, reason: 'No answer', remote: true,
};

test('this machine is never offered, however it is labelled', () => {
  // The server returns it on purpose (it distinguishes "unreachable" from "no
  // peers"), so the filter is the only thing keeping it out of the picker.
  assert.deepEqual(remoteMachines([LOCAL, PEER]), [PEER]);
  assert.deepEqual(remoteMachines([LOCAL]), []);
});

test('an offline machine stays in the list, disabled and named', () => {
  const offered = remoteMachines([LOCAL, PEER, OFFLINE]);
  assert.equal(offered.length, 2);
  const opt = machineOption(OFFLINE);
  assert.equal(opt.disabled, true);
  assert.match(opt.label, /No answer/);
  assert.equal(machineOption(PEER).disabled, false);
});

test('the note tells the three states apart', () => {
  assert.equal(machineNote({ configured: false, machines: [] }), '',
    'no address set is not a problem to report — the feature is simply off');
  assert.match(machineNote({ configured: true, machines: [] }), /did not answer/);
  assert.match(machineNote({ configured: true, machines: [LOCAL] }), /no other machines/);
  assert.equal(machineNote({ configured: true, machines: [LOCAL, PEER] }), '');
});

test('an error is reported even when the list came back non-empty', () => {
  // /api/training/machines degrades rather than 500s, so it can answer with
  // both a list and an error. Silence there would show a stale-looking picker.
  assert.match(machineNote({ configured: true, machines: [LOCAL, PEER], error: 'boom' }),
    /did not answer/);
});

test('a remembered machine that is gone falls back to this machine', () => {
  // Not merely cosmetic: with no matching <option> the browser paints the first
  // one, so the picker would read "This machine" while the launch posted a peer
  // — the exact failure the bank's Run-on picker shipped.
  assert.equal(reconcileMachine('workshop:0', [LOCAL, PEER]), 'workshop:0');
  assert.equal(reconcileMachine('workshop:0', [LOCAL]), 'local', 'removed from ai-toolkit');
  assert.equal(reconcileMachine('shed:0', [LOCAL, OFFLINE]), 'local', 'offline is not pickable');
  assert.equal(reconcileMachine('0', [LOCAL, PEER]), 'local',
    'a bare index is this machine — the server refuses it, so never restore it');
  assert.equal(reconcileMachine(null, [LOCAL, PEER]), 'local');
});

test('a half-known step count is not shown at all', () => {
  // The remote job reports its total only once it starts; "step 0 of null" is
  // worse than no number.
  const line = peerRunLine({ status: 'queued', machine_label: 'Workshop', step: 0 });
  assert.match(line, /Queued on Workshop/);
  assert.doesNotMatch(line, /step/);
  assert.match(peerRunLine({ status: 'running', machine_label: 'Workshop', step: 40, total_steps: 1200 }),
    /step 40 \/ 1200/);
});

test('a requested stop is visible until the run actually ends', () => {
  const asked = { status: 'running', machine_label: 'Workshop', stop_requested: true };
  assert.match(peerRunLine(asked), /stop requested/);
  // Once it is over, saying "stop requested" alongside "Stopped" is noise.
  assert.doesNotMatch(peerRunLine({ ...asked, status: 'stopped' }), /stop requested/);
});

test('a failure carries its cause into the line', () => {
  assert.match(peerRunLine({ status: 'failed', machine_label: 'Workshop', error: 'peer went away' }),
    /peer went away/);
});

test('active means "still occupying the other machine"', () => {
  assert.equal(isActiveRun({ status: 'running' }), true);
  assert.equal(isActiveRun({ status: 'preparing' }), true);
  // Deliberately open-ended: anything that is not one of the three endings
  // counts as active. A status added server-side must not silently read as
  // finished — that would hide a live run's Stop button.
  assert.equal(isActiveRun({ status: 'something-new' }), true);
  for (const status of ['done', 'failed', 'stopped']) {
    assert.equal(isActiveRun({ status }), false, `${status} is over`);
  }
  assert.equal(isActiveRun(null), false);
});
