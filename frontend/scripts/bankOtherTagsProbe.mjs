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
const settingsOutcomes = [];
const settingsSections = [...fs.readFileSync(path.join(root, 'frontend/src/components/settings/registry.js'), 'utf8')
  .matchAll(/\{ id: '([^']+)', title: '([^']+)'/g)].map((match) => ({ id: match[1], title: match[2] }));
assert.ok(settingsSections.length > 0, 'Settings route discovery must not be empty');
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
  for (const [viewportIndex, [width, height]] of viewports.entries()) {
    console.log(`Checking Bank at ${width}x${height}`);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    await page.addInitScript((id) => localStorage.setItem('bankCurrentId', String(id)), ready.bank_id);
    // Hold the source check open. Saved images and metadata must render before
    // it finishes, even when the original folder is slow to enumerate.
    let releaseSource;
    const sourceGate = new Promise((resolve) => { releaseSource = resolve; });
    await context.route('**/folder-sync', async (route) => {
      await sourceGate;
      await route.continue();
    });
    const sourceRequested = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/folder-sync'));
    const sourceResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/folder-sync'));
    try {
      await page.goto(`${url}/#/bank`);
    await page.waitForFunction(() => document.querySelector('[aria-label="Active Profile"]')?.textContent === 'Default');
      await page.locator(`img[src^="/api/bank/${ready.bank_id}/thumb/"]`).first().waitFor();
      await page.getByRole('heading', { name: 'Demo', exact: true }).waitFor();
      const nameBounds = await page.getByRole('heading', { name: 'Demo', exact: true }).evaluate((heading) => {
        const label = heading.querySelector('span');
        const original = { text: label.textContent, title: label.title };
        try {
          label.textContent = `Synthetic Bank ${'long-name-'.repeat(20)}`;
          label.title = label.textContent;
          const box = heading.getBoundingClientRect();
          return { left: box.left, right: box.right, viewport: document.documentElement.clientWidth };
        } finally {
          label.textContent = original.text;
          label.title = original.title;
        }
      });
      assert.ok(nameBounds.left >= -1 && nameBounds.right <= nameBounds.viewport + 1,
        'A long Bank name must fit the header at every viewport');
      await sourceRequested;
      assert.equal(await page.locator(`img[src^="/api/bank/${ready.bank_id}/thumb/"]`).count(), 4);
    } finally {
      releaseSource();
    }
    assert.equal((await sourceResponse).status(), 200);
    await context.unroute('**/folder-sync');
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
    if (await drawer.count()) await page.getByRole('button', { name: 'Close the filters', exact: true }).click();

    // Import an isolated source with one excluded child. The parent must stay
    // one bank, with its loose images and checked child together.
    await page.getByRole('button', { name: '← Banks', exact: true }).click();
    await page.locator('#bank-name').fill(`Demo Import ${viewportIndex + 1}`);
    await page.locator('#bank-folder').fill(ready.import_folders[viewportIndex]);
    await page.getByRole('button', { name: 'Choose Subfolders', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Separate Banks', exact: true }).isChecked(), false);
    await page.getByRole('checkbox', { name: /^beta\b/ }).uncheck();
    await page.getByText('One Bank · 3 Images', { exact: true }).waitFor();
    const created = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/bank/create');
    await page.getByRole('button', { name: 'Create Bank', exact: true }).click();
    const createdResponse = await created;
    assert.equal(createdResponse.status(), 200);
    const imported = await createdResponse.json();
    assert.deepEqual(imported.excluded_folders, ['beta']);
    await page.getByRole('heading', { name: `Demo Import ${viewportIndex + 1}`, exact: true }).waitFor();
    const imageResponse = await context.request.get(`${url}/api/bank/${imported.id}/images`);
    assert.equal((await imageResponse.json()).total, 3);

    // Check the actual field boxes on every core Settings route. This inspects
    // the rendered CSS, including nested grids, instead of matching classes.
    for (const { id: section, title } of settingsSections) {
      console.log(`Checking Settings ${section} at ${width}x${height}`);
      await page.goto(`${url}/#/settings/${section}`);
      await page.locator('.settings-page h1').waitFor();
      await page.waitForFunction((expected) => document.querySelector('.settings-page h1')?.textContent.includes(expected), title);
      await page.waitForFunction(() => document.querySelector('.settings-page .lds-section'));
      const measured = await page.locator('.settings-page').evaluate((element) => {
        const visible = (node) => !!(node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
        const fieldGrids = element.querySelectorAll('.settings-fields, .settings-fields > div.grid');
        const grids = [...(fieldGrids.length ? fieldGrids : element.querySelectorAll('.lds-section > div.grid'))]
          .filter(visible).map((grid) => ({
            columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
            fields: [...grid.children].filter(visible).length,
          }));
        const controls = [...element.querySelectorAll('input, select, textarea, button')]
          .filter(visible).map((node) => {
            const box = node.getBoundingClientRect();
            const clipping = node.closest('[class*="overflow-x-auto"]');
            return { left: box.left, right: box.right, width: box.width,
              scrollable: !!clipping };
          });
        return { width: element.getBoundingClientRect().width, grids, controls };
      });
      assert.ok(measured.grids.length > 0, `${section}: no rendered settings card`);
      assert.ok(measured.grids.every((grid) => grid.columns === (width >= 640 ? 2 : 1)),
        `${section}: field grid has the wrong column count at ${width}px`);
      assert.ok(measured.controls.every((control) => control.width > 0
        && (control.scrollable || (control.left >= -1 && control.right <= width + 1))),
      `${section}: a control is clipped or outside the viewport at ${width}px`);
      if (width >= 1280) assert.ok(measured.width > width * 0.85, 'Settings must use the wide shell');
      settingsOutcomes.push({ section, width, height, passed: true });
    }

    // Selecting a dataset destination must not save or move anything. Exercise
    // the shared host browser on every supported size using synthetic folders.
    // Storage metadata can arrive after navigation inside the browser. Hold it
    // until the user opens a different folder, then verify navigation survives.
    // A hash-only navigation can reuse an already loaded Settings section.
    let releaseLocations;
    const locationsGate = new Promise((resolve) => { releaseLocations = resolve; });
    await page.route('**/api/storage/locations', async (route) => {
      await locationsGate;
      await route.continue();
    });
    await Promise.all([
      page.waitForRequest((request) => new URL(request.url()).pathname === '/api/storage/locations'),
      page.goto(`${url}/?storage-probe=${viewportIndex}#/settings/storage?focus=dataset-images-root`),
    ]);
    const rootField = page.locator('#dataset-images-root');
    await rootField.waitFor({ state: 'visible' });
    const card = page.locator('div').filter({ has: rootField }).filter({
      has: page.getByRole('button', { name: 'Check Folder', exact: true }),
    }).last();
    const beforeSettings = await context.request.get(`${url}/api/settings`);
    assert.equal(beforeSettings.status(), 200);
    const beforeConfig = (await beforeSettings.json()).config;
    await card.getByRole('button', { name: 'Browse', exact: true }).click();
    const browserDialog = page.getByRole('dialog', { name: 'Choose a folder', exact: true });
    await browserDialog.locator('ul[aria-busy="false"]').waitFor();
    const address = browserDialog.getByRole('textbox', { name: 'Folder path', exact: true });
    await address.fill(ready.import_folders[viewportIndex]);
    const [listing] = await Promise.all([
      page.waitForResponse((response) => {
        const target = new URL(response.url());
        return target.pathname === '/api/system/list-folders'
          && target.searchParams.get('path') === ready.import_folders[viewportIndex];
      }),
      browserDialog.getByRole('button', { name: 'Go', exact: true }).click(),
    ]);
    assert.equal(listing.status(), 200);
    assert.equal((await listing.json()).path, ready.import_folders[viewportIndex]);
    await browserDialog.locator('ul[aria-busy="false"]').waitFor();
    const locationsResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/storage/locations');
    releaseLocations();
    const locations = (await (await locationsResponse).json()).locations;
    const currentRoot = locations.find((location) => location.key === 'datasets').path;
    // Wait for the parent to render the late result, rather than add a sleep.
    await page.waitForFunction((current) => [...document.querySelectorAll('p')]
      .some((node) => node.textContent.includes('In use now:') && node.textContent.includes(current)), currentRoot);
    await page.unroute('**/api/storage/locations');
    assert.equal(await address.inputValue(), ready.import_folders[viewportIndex]);
    const pick = browserDialog.getByRole('button', { name: 'Use Folder', exact: true });
    await pick.waitFor();
    const browserBoxes = await browserDialog.locator('input, button').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    assert.ok(browserBoxes.every((box) => box.left >= -1 && box.right <= width + 1
      && box.top >= -1 && box.bottom <= height + 1), 'Host browser controls must fit the viewport');
    await pick.click();
    await browserDialog.waitFor({ state: 'hidden' });
    assert.equal(await rootField.inputValue(), ready.import_folders[viewportIndex]);
    const afterSettings = await context.request.get(`${url}/api/settings`);
    assert.equal(afterSettings.status(), 200);
    const afterConfig = (await afterSettings.json()).config;
    assert.deepEqual(afterConfig.paths, beforeConfig.paths, 'Browse must not save the destination');
    const checked = page.waitForResponse((response) => response.url().endsWith('/api/storage/validate'));
    await card.getByRole('button', { name: 'Check Folder', exact: true }).click();
    assert.equal((await checked).status(), 200);
    const boxes = await card.locator('input, button').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, height: box.height };
    }));
    assert.ok(boxes.every((box) => box.left >= -1 && box.right <= width + 1),
      'Dataset destination controls must fit the viewport');
    settingsOutcomes.push({ section: 'storage-browser', width, height, lateMetadata: true, passed: true });
    assert.deepEqual(errors, []);
    outcomes.push({ width, height, firstPageBeforeSourceCheck: true, singleBankExclusions: true, passed: true });
    // Leave only the tagged demo bank for the existing probe's list primer.
    assert.equal((await context.request.delete(`${url}/api/bank/${imported.id}`)).status(), 200);
    await context.close();
  }
  const probe = await run(process.execPath, ['scripts/responsiveProbe.mjs', '--url', `${url}/#/bank`,
    '--states', 'resting,rail,other-tags,other-tags-drawer', '--json']);
  fs.mkdirSync(receipts, { recursive: true });
  const settingsProbe = [];
  for (const { id: section } of settingsSections) {
    settingsProbe.push({ section, result: await run(process.execPath, ['scripts/responsiveProbe.mjs',
      '--url', `${url}/#/settings/${section}`, '--states', 'resting', '--json']) });
  }
  await writeFile(path.join(receipts, 'other-tags.json'), JSON.stringify({ outcomes, settingsOutcomes,
    responsive: probe, settingsResponsive: settingsProbe }, null, 2));
  console.log(`Bank checks passed at ${outcomes.length} sizes; ${settingsOutcomes.length} Settings route checks passed.\n${probe}\n${JSON.stringify(settingsProbe)}`);
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
