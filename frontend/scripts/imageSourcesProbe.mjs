/** Cloud-only acquisition checks. Synthetic media; no public network. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { findHeadlessShell } from './responsiveProbe.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runtime = await mkdtemp(path.join(tmpdir(), 'lds-image-sources-'))
const receipts = path.join(root, '.git', 'lds-gates-validation')
const cases = []
let server, browser
let output = ''
try {
  const socket = createServer()
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const url = `http://127.0.0.1:${port}`
  const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  server = spawn(python, [path.join(root, 'backend/tests/image_sources_server.py'), runtime, String(port)],
    { cwd: root, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } })
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  let ready
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(output)
    try { const response = await fetch(`${url}/test/ready`); if (response.ok) { ready = await response.json(); break } } catch { /* startup */ }
    await delay(500)
  }
  assert.ok(ready, `Synthetic source server did not start. ${output}`)
  const catalogResponse = await fetch(`${url}/api/image-sources`)
  assert.equal(catalogResponse.status, 200, `Source catalog unavailable. ${output}`)
  assert.equal((await catalogResponse.json()).capability.ok, true)
  browser = await chromium.launch({ executablePath: findHeadlessShell(fs, path) })
  for (const [width, height] of [[360, 800], [412, 915], [844, 390], [768, 1024], [1280, 800]]) {
    for (const surface of ['bank', 'dataset']) {
      console.log(`Checking Image Sources ${surface} ${width}x${height}`)
      const context = await browser.newContext({ viewport: { width, height } })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      if (surface === 'dataset') await page.addInitScript((id) => localStorage.setItem('datasetCurrentId', String(id)), ready.dataset_id)
      const before = await (await fetch(`${url}/test/ready`)).json()
      await page.goto(`${url}/#/${surface === 'bank' ? 'bank' : 'datasets?section=add'}`)
      const id = `image-sources-${surface === 'bank' ? 'bank' : `dataset-${ready.dataset_id}`}`
      const panel = page.locator(`#${id}`)
      await panel.locator('summary').first().click()
      await panel.getByRole('button', { name: 'Scan', exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction((selector) => [...document.querySelector(selector).querySelectorAll('button')]
        .find((node) => node.textContent === 'Scan')?.disabled === false,
      `#${id}`, { timeout: 15000 }).catch(async (failure) => {
        throw new Error(`Source controls unavailable: ${await panel.innerText()}. ${output}`, { cause: failure })
      })
      const afterOpen = await (await fetch(`${url}/test/ready`)).json()
      assert.equal(afterOpen.scans, before.scans, 'Opening the panel started a scan')
      assert.equal(afterOpen.downloads, before.downloads, 'Opening the panel started a download')
      if (surface === 'bank') {
        await panel.getByLabel('Search Preset', { exact: true }).selectOption('danbooru')
        await panel.getByLabel('Tag Query', { exact: true }).fill('synthetic_tag')
      } else {
        await panel.getByLabel('URL', { exact: true }).fill('https://images.example.test/collection/1')
      }
      await panel.getByRole('button', { name: 'Scan', exact: true }).click()
      await panel.getByRole('button', { name: 'Clear All', exact: true }).waitFor({ state: 'visible' })
      await panel.getByRole('button', { name: 'Clear All', exact: true }).click()
      await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('0 Selected'), `#${id}`)
      await panel.getByRole('checkbox').nth(0).check()
      await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('1 Selected'), `#${id}`)
      await panel.getByRole('checkbox').nth(1).check()
      await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('2 Selected'), `#${id}`)
      await panel.getByRole('button', { name: 'Download', exact: true }).click()
      await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('2 Downloaded'), `#${id}`, { timeout: 30000 })
      await panel.getByRole('button', { name: 'Import Images', exact: true }).click()
      await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('2 Imported'), `#${id}`, { timeout: 30000 })
      if (width === 1280 && surface === 'bank') {
        await panel.getByRole('button', { name: 'Next', exact: true }).click()
        await panel.getByText('Video', { exact: true }).waitFor({ state: 'visible' })
        await panel.getByRole('checkbox').nth(2).check()
        await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('3 Selected'), `#${id}`)
        await panel.getByRole('button', { name: 'Download', exact: true }).click()
        await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('3 Downloaded'), `#${id}`)
        const link = panel.getByRole('link', { name: 'Save Original', exact: true })
        const original = await context.request.get(`${url}${await link.getAttribute('href')}`)
        assert.equal(original.status(), 200)
        assert.match(original.headers()['content-disposition'], /^attachment;/)
        assert.equal((await original.body()).toString(), 'synthetic-video-container')
      }
      await panel.getByText('Extractor Settings', { exact: true }).click()
      await panel.getByText('Credentials', { exact: true }).click()
      const measurement = await panel.evaluate((element) => {
        const viewport = document.documentElement.clientWidth
        const visible = [...element.querySelectorAll('button, input:not([type=checkbox]), select, a, summary')]
          .filter((node) => node.getClientRects().length && node.getBoundingClientRect().width > 0)
        return { overflow: document.documentElement.scrollWidth > viewport + 1,
          clipped: visible.filter((node) => { const box = node.getBoundingClientRect(); return box.left < -1 || box.right > viewport + 1 }).length,
          small: visible.filter((node) => node.getBoundingClientRect().height < 39).length,
          overlaps: visible.filter((node, index) => visible.slice(index + 1).some((other) => {
            if (node.contains(other) || other.contains(node)) return false
            const a = node.getBoundingClientRect(), b = other.getBoundingClientRect()
            return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2
              && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
          })).length }
      })
      assert.deepEqual(measurement, { overflow: false, clipped: 0, small: 0, overlaps: 0 })
      assert.deepEqual(errors, [])
      cases.push({ surface, width, height, ...measurement,
        input: surface === 'bank' ? 'search-preset' : 'public-url',
        downloadOnlyVideo: width === 1280 && surface === 'bank',
        interactions: width === 1280 && surface === 'bank' ? 11 : 7 })
      console.log(`Image Sources ${surface} ${width}x${height}: passed`)
      await context.close()
    }
  }
  await mkdir(receipts, { recursive: true })
  await writeFile(path.join(receipts, 'image-sources.json'), JSON.stringify({ cases, skipped: 0 }, null, 2))
} catch (failure) {
  console.error(output)
  throw failure
} finally {
  await browser?.close()
  server?.kill()
  if (server && server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve))
  await rm(runtime, { recursive: true, force: true })
}
