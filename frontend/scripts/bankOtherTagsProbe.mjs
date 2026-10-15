/** Cloud-only rendered checks against the real Bank and synthetic local data. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { findHeadlessShell } from './responsiveProbe.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = await mkdtemp(path.join(tmpdir(), 'lds-other-tags-'));
const receipts = path.join(root, '.git', 'lds-gates-validation');
const viewports = [[360, 800], [412, 915], [844, 390], [768, 1024], [1280, 800]];
const outcomes = [];
let server;
let browser;
let serverOutput = '';
let serverUrl;

async function run(command, args) {
  const child = spawn(command, args, { cwd: path.join(root, 'frontend'), windowsHide: true });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) throw new Error(output);
  return output;
}

try {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  const url = `http://127.0.0.1:${port}`;
  serverUrl = url;
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  server = spawn(python, [path.join(root, 'backend/tests/bank_other_tags_server.py'), runtime, String(port)],
    { cwd: root, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
  server.stdout.on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });
  let ready;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      const response = await fetch(`${url}/test/ready`);
      if (response.ok) { ready = await response.json(); break; }
    } catch { /* The isolated server is still starting. */ }
    await delay(500);
  }
  assert.ok(ready, `Synthetic server did not start. ${serverOutput}`);
  const executablePath = findHeadlessShell(fs, path);
  assert.ok(executablePath, 'Install the cloud Chromium headless shell before running this check.');
  browser = await chromium.launch({ executablePath });
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    await page.addInitScript((id) => localStorage.setItem('bankCurrentId', String(id)), ready.bank_id);
    await page.goto(`${url}/#/bank`);
    const drawer = page.locator('[aria-controls="bank-filter-rail"]:visible');
    await page.getByRole('button', { name: /^Other Tags/ }).or(drawer).first().waitFor();
    if (await drawer.count()) await drawer.click();
    const trigger = page.getByRole('button', { name: /^Other Tags/ });
    await trigger.click();
    const panel = page.locator('#tag-facet-other');
    const search = panel.getByRole('searchbox');
    await search.fill('blue');
    const selectAll = panel.getByRole('button', { name: /^Select All/ });
    await selectAll.waitFor();
    assert.equal(await panel.getByRole('button').first().textContent(), 'Select All (150)');
    assert.equal(await panel.getByRole('checkbox').count(), 100);
    const response = page.waitForResponse((item) => {
      const requested = new URL(item.url());
      return requested.pathname.endsWith('/images')
        && requested.searchParams.get('wd14_tags')?.split('|').length === 150;
    });
    await selectAll.click();
    assert.equal((await (await response).json()).images.length, 3);
    assert.equal(await panel.locator('input:checked').count(), 100);
    assert.equal(await selectAll.isDisabled(), true);
    await panel.getByRole('button', { name: 'Show More' }).click();
    assert.equal(await panel.getByRole('checkbox').count(), 150);
    assert.equal(await panel.locator('input:checked').count(), 150);
    await search.fill('blue_0149');
    assert.equal(await panel.getByRole('checkbox').isChecked(), true);
    await search.fill('no_matching_tag');
    await panel.getByText('No matching tags.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: /^Select All/ }).isDisabled(), true);
    await search.fill('long');
    await panel.getByRole('checkbox').waitFor();
    const layout = await panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const labels = [...element.querySelectorAll('label')].map((label) => {
        const row = label.getBoundingClientRect();
        return { left: row.left, right: row.right, height: row.height };
      });
      return { left: box.left, right: box.right, overflow: element.scrollWidth - element.clientWidth, labels };
    });
    assert.ok(layout.left >= -1 && layout.right <= width + 1 && layout.overflow <= 1);
    assert.ok(layout.labels.every((row) => row.left >= layout.left - 1 && row.right <= layout.right + 1));
    if (width < 1024) assert.ok(layout.labels.every((row) => row.height >= 40));
    await search.press('Escape');
    await panel.waitFor({ state: 'detached' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errors, []);
    outcomes.push({ width, height, passed: true });
    await context.close();
  }
  const probe = await run(process.execPath, ['scripts/responsiveProbe.mjs', '--url', `${url}/#/bank`,
    '--states', 'resting,rail,other-tags,other-tags-drawer', '--json']);
  fs.mkdirSync(receipts, { recursive: true });
  await writeFile(path.join(receipts, 'other-tags.json'), JSON.stringify({ outcomes, responsive: probe }, null, 2));
  console.log(`Other Tags browser checks passed at ${outcomes.length} viewport sizes.\n${probe}`);
} catch (error) {
  console.error(error.stack || error);
  for (const context of browser?.contexts() || []) {
    for (const page of context.pages()) {
      console.error(JSON.stringify({ url: page.url(),
        headings: await page.locator('h1').allTextContents(),
        buttons: await page.getByRole('button').allTextContents() }));
    }
  }
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', () => resolve(true)));
    try {
      await fetch(`${serverUrl}/test/shutdown`, { method: 'POST', signal: AbortSignal.timeout(5000) });
    } catch { /* A failed startup may not have opened the fixture endpoint. */ }
    if (!await Promise.race([exited, delay(10000, false, { ref: false })])) {
      if (process.platform === 'win32') await run('taskkill', ['/PID', String(server.pid), '/T', '/F']);
      else server.kill();
      await exited;
    }
  }
  const parent = path.resolve(tmpdir()) + path.sep;
  assert.ok(path.resolve(runtime).startsWith(parent) && path.basename(runtime).startsWith('lds-other-tags-'));
  await rm(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
