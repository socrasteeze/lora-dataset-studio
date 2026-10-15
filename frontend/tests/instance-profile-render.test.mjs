import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './support/mountJsx.mjs';

const { default: InstanceProfile } = await import('../src/components/common/InstanceProfile.jsx');
const { TextField } = await import('../src/components/settings/primitives.jsx');
const { default: ServerSection } = await import('../src/components/settings/ServerSection.jsx');
const { default: ProfileDialog } = await import('../src/components/common/ProfileDialog.jsx');

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

test('the in-app profile popup provides creation and a controlled switch', () => {
  const html = render(ProfileDialog, { onClose() {} });
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Create Profile/);
  assert.match(html, /Switch Profile/);
  assert.match(html, /One profile runs at a time/);
});

test('the Bank move popup explains file preservation before submission', () => {
  const html = render(ProfileDialog, {
    bank: { id: 1, instance_id: 'a'.repeat(32), name: 'Example Bank' }, onClose() {},
  });
  assert.match(html, /Move Bank/);
  assert.match(html, /Source images stay in place/);
  assert.match(html, /after verification/);
  assert.doesNotMatch(html, /Switch Profile/);
});
