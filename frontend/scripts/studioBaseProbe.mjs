/** Cloud-only Studio controls. Job and installer writes use invented responses. */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { findHeadlessShell } from './responsiveProbe.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runtime = await mkdtemp(path.join(tmpdir(), 'lds-studio-'))
const receipts = path.resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'lds-gates-validation'],
  { cwd: root, encoding: 'utf8', windowsHide: true }).trim())
const outcomes = []
let server, browser, url, activePage
let output = '', complete = false, failure = null
try {
  const socket = createServer()
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  url = 'http://127.0.0.1:' + port
  server = spawn(path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    [path.join(root, 'backend/tests/identity_learning_server.py'), runtime, String(port)],
    { cwd: root, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', OMP_NUM_THREADS: '1' } })
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  let ready
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw new Error(output)
    try { const response = await fetch(url+'/test/ready'); if (response.ok) { ready = await response.json(); break } }
    catch { /* Bounded fixture startup. */ }
    await delay(500)
  }
  assert.ok(ready, 'Studio fixture must start')
  browser = await chromium.launch({ executablePath: findHeadlessShell(fs, path) })
  const before = await (await fetch(url+'/test/state')).json()
  for (const [width, height] of [[360, 800], [412, 915], [844, 390], [768, 1024], [1280, 800]]) {
    for (const family of ['zimage', 'moss']) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1024 })
      const page = await context.newPage()
      activePage = page
      const errors = [], launches = [], installs = []
      let installed = family !== 'moss'
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/api/studio/base-models?*', (route) => {
        const kind = new URL(route.request().url()).searchParams.get('type')
        const moss = kind === 'moss'
        const missing = moss && !installed ? ['LDSMossUNETLoader', 'LDSMossCLIPLoader'] : []
        return route.fulfill({ json: {
          family: kind, models: [{ filename: 'base.safetensors', label: 'Demo base' }],
          default_model: 'base.safetensors',
          axes: { cfg_choices: [1, 3], steps_choices: [8, 50], default_cfg: moss ? 3 : 1, default_steps: moss ? 50 : 8 },
          generation_capabilities: { negative_prompt: true },
          generation_readiness: { label: moss ? 'MOSS-Image' : 'Z-Image', models_ready: true,
            missing_nodes: missing, downloads: [], node_packs: missing.map((class_type) => ({
              class_type, pack: 'MOSS-Image loaders', install_action: 'moss_nodes' })) },
        } })
      })
      await page.route((target) => target.pathname.startsWith('/api/setup/install/moss_nodes'), (route) => {
        if (route.request().method() === 'POST') { installs.push('moss_nodes'); installed = true }
        return route.fulfill({ json: { state: installed ? 'success' : 'idle', log: [], returncode: installed ? 0 : null } })
      })
      await page.route('**/api/studio/run', (route) => {
        assert.equal(route.request().method(), 'POST')
        launches.push(route.request().postDataJSON())
        return route.fulfill({ json: { ok: true, run_id: 'demo-run', created: 1, seed: 123, count: 1 } })
      })
      await page.route('**/api/studio/run/demo-run/status', (route) => route.fulfill({ json: {
        run_id: 'demo-run', base_only: true, loras: [], pending: 0, queued: 0, generating: 0,
        resumable: 0, gpu_busy: false, cells: [{ id: 900, dataset_id: ready.dataset_id,
          filename: 'image-01.png', label: 'Base model', strength: null, family, base_only: true,
          status: 'done', aspect: '1:1', seed: 123, rating: 0, prompt: 'An invented landscape.' }],
      } }))
      await page.goto(url+'/#/studio')
      const familyPicker = page.getByRole('combobox', { name: 'Model Family', exact: true })
      await familyPicker.selectOption(family)
      const baseButton = page.getByRole('button', { name: 'Base Model Only', exact: true })
      assert.equal(await baseButton.getAttribute('aria-pressed'), 'true')
      const prompt = page.locator('#studio-run-prompt')
      await prompt.fill('An invented landscape.')
      const runButton = page.locator('#st-setup').getByRole('button', { name: 'Run the test', exact: true })
      assert.equal(launches.length, 0)
      assert.equal(installs.length, 0)
      if (family === 'moss') {
        await page.getByRole('button', { name: 'Fix missing ComfyUI nodes', exact: true }).click()
        const install = page.getByRole('button', { name: 'Install MOSS-Image Loaders', exact: true })
        await install.waitFor()
        assert.equal(await install.count(), 1, 'One installer per shared node pack')
        assert.equal(await runButton.isDisabled(), true)
        await install.click()
        await install.waitFor({ state: 'detached' })
        assert.deepEqual(installs, ['moss_nodes'])
        assert.equal(await prompt.inputValue(), 'An invented landscape.')
      }
      await page.waitForFunction(() => document.querySelector('#st-setup [aria-label="Run the test"]')?.disabled === false)
      await runButton.click()
      await page.locator('#st-results img[alt^="Base model"]').waitFor()
      assert.equal(launches.length, 1)
      assert.equal(launches[0].base_only, true)
      assert.equal(launches[0].family, family)
      assert.deepEqual(launches[0].selections, [])
      assert.equal(launches[0].inject_trigger, false)
      assert.equal(launches[0].strengths, undefined)
      assert.deepEqual(launches[0].cfgs, [family === 'moss' ? 3 : 1])
      assert.deepEqual(launches[0].steps, [family === 'moss' ? 50 : 8])
      assert.ok(!launches[0].permanent_loras?.length)
      const layout = await page.evaluate(() => {
        const controls = [document.querySelector('[aria-label="Model Family"]'),
          [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Base Model Only')]
        return { viewport: innerWidth, scroll: document.documentElement.scrollWidth,
          controls: controls.map((el) => { const r = el.getBoundingClientRect(); return {
            left: r.left, right: r.right, width: r.width, height: r.height,
          } }) }
      })
      assert.ok(layout.scroll <= width+1, JSON.stringify(layout))
      for (const control of layout.controls) {
        assert.ok(control.left >= -1 && control.right <= width+1, JSON.stringify(layout))
        if (width < 1024) assert.ok(control.width >= 40 && control.height >= 40, JSON.stringify(layout))
      }
      assert.deepEqual(errors, [])
      outcomes.push({ width, height, family, installed: installs.length, layout, passed: true })
      await context.close()
    }
  }
  assert.deepEqual(await (await fetch(url+'/test/state')).json(), before)
  assert.equal(outcomes.length, 10)
  complete = true
  console.log('Base-model launch, MOSS preparation and layout passed in 10 populated states.')
} catch (error) {
  failure = String(error.stack || error)
  throw error
} finally {
  fs.mkdirSync(receipts, { recursive: true })
  await writeFile(path.join(receipts, 'studio-base.json'), JSON.stringify({
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    expected: 10, outcomes, complete, failure,
    diagnostic: failure && activePage && !activePage.isClosed() ? {
      headings: await activePage.getByRole('heading').allTextContents(),
      buttons: await activePage.getByRole('button').allTextContents(),
    } : null,
  }, null, 2))
  await browser?.close()
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve))
    try { await fetch(url+'/test/shutdown', { method: 'POST', signal: AbortSignal.timeout(5000) }) } catch { /* Startup may fail. */ }
    if (!await Promise.race([exited.then(() => true), delay(10000, false, { ref: false })])) {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true })
      else server.kill()
      await exited
    }
  }
  const resolved = path.resolve(runtime)
  assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep) && path.basename(resolved).startsWith('lds-studio-'))
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
