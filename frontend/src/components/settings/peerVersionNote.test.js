/* A mixed-version cluster is reported, and nothing else is.
 *
 * The wrong version this pins: there was no handshake, so `peerVersionNote`
 * did not exist and every cluster looked matched. The failure mode that
 * matters most here is the OPPOSITE one though — a note that fires when a peer
 * has simply never checked in would put a scary line on every fresh join, so
 * the silence cases are asserted as hard as the mismatch case.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { peerVersionNote } from './peerVersionNote.js'

test('a genuine mismatch names both sides', () => {
  const note = peerVersionNote({ app_version: '2026.07.30' }, { app_version: '2026.08.04' })
  assert.equal(note, 'runs 2026.07.30, this machine runs 2026.08.04')
})

test('matching builds say nothing', () => {
  assert.equal(peerVersionNote({ app_version: '2026.08.04' }, { app_version: '2026.08.04' }), null)
})

test('a peer that has never checked in is not accused of anything', () => {
  // A fresh join reports no capabilities at all. Being unable to describe
  // yourself is not the same as running the wrong build.
  assert.equal(peerVersionNote(null, { app_version: '2026.08.04' }), null)
  assert.equal(peerVersionNote({}, { app_version: '2026.08.04' }), null)
})

test('a peer on code older than the handshake itself is not accused either', () => {
  // The whole point of adding the key is that older peers do not send it.
  assert.equal(peerVersionNote({ ollama: true }, { app_version: '2026.08.04' }), null)
})

test('an unknown local version says nothing rather than guessing', () => {
  assert.equal(peerVersionNote({ app_version: '2026.07.30' }, {}), null)
  assert.equal(peerVersionNote({ app_version: '2026.07.30' }, null), null)
})

test('whitespace-only versions count as unknown, not as a mismatch', () => {
  assert.equal(peerVersionNote({ app_version: '   ' }, { app_version: '2026.08.04' }), null)
})
