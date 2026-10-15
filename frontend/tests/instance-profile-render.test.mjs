import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './support/mountJsx.mjs';

const { default: InstanceProfile } = await import('../src/components/common/InstanceProfile.jsx');
const { TextField } = await import('../src/components/settings/primitives.jsx');
const { default: ServerSection } = await import('../src/components/settings/ServerSection.jsx');

test('profile identity reserves a bounded line before its response arrives', () => {
  const html = render(InstanceProfile);
  assert.match(html, /aria-label="Active Profile"/);
  assert.match(html, /min-h-4/);
  assert.match(html, /max-w-48/);
});

test('owned training paths remain readable but cannot be edited', () => {
  const html = render(TextField, {
    id: 'profile-output', label: 'Output', value: '/example/profile/output', readOnly: true,
  });
  assert.match(html, /readonly=""/i);
  assert.match(html, /value="\/example\/profile\/output"/);
});

test('profile ports stay fixed while local-network access remains editable', () => {
  const html = render(ServerSection, {
    config: { server: { host: '127.0.0.1', port: 5050 } },
    runtime: { profile: { port: 5051 } }, setField() {}, configDefaults: {},
  });
  assert.match(html, /id="server-port"[^>]*readonly=""[^>]*value="5051"/i);
  assert.doesNotMatch(html, /server-bind-managed-note/);
  assert.match(html, /Available on the local network/);
});
