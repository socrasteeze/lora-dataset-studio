/** Rendered header checks. Only the isolated cloud fixture calls these. */
import assert from 'node:assert/strict'
import path from 'node:path'

const readLayout = (dataset) => {
  const app = document.querySelector('.app-header')
  const brand = app.querySelector('.app-header-shell > a')
  const title = brand.firstElementChild.getBoundingClientRect()
  const profile = brand.querySelector('[aria-label="Active Profile"]').getBoundingClientRect()
  const viewport = document.documentElement.clientWidth
  const header = dataset ? document.querySelector('[data-probe-chrome="header"]') : null
  const controls = [...app.querySelectorAll('a, button'), ...(header?.querySelectorAll('button, summary') || [])]
    .filter((node) => node.checkVisibility() && node.getBoundingClientRect().width > 0)
  const bounds = (node) => {
    const box = node.getBoundingClientRect()
    return [box.left + window.scrollX, box.top + window.scrollY, box.width, box.height].map(Math.round)
  }
  const actions = header ? [header.querySelector('button:has(svg.lucide-download)'), header.querySelector('summary')] : []
  return {
    overflow: document.documentElement.scrollWidth > viewport + 1,
    clipped: controls.filter((node) => { const box = node.getBoundingClientRect(); return box.left < -1 || box.right > viewport + 1 }).length,
    small: controls.filter((node) => viewport < 1024 && (node.getBoundingClientRect().height < 39 || node.getBoundingClientRect().width < 39)).length,
    overlaps: controls.filter((node, index) => controls.slice(index + 1).some((other) => {
      if (node.contains(other) || other.contains(node)) return false
      const a = node.getBoundingClientRect(), b = other.getBoundingClientRect()
      return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
    })).length,
    profileGap: profile.top - title.bottom,
    profileWidth: profile.width,
    profileAligned: Math.abs(profile.left - title.left) <= 1,
    profileContained: profile.right <= brand.getBoundingClientRect().right + 1,
    actions: actions.map(bounds), controls: controls.length,
    landmarks: [brand, ...(header ? [header, ...header.children] : [])].map(bounds),
  }
}

function assertLayout(layout, width) {
  for (const key of ['clipped', 'small', 'overlaps']) assert.equal(layout[key], 0, `${width}px header ${key}`)
  assert.equal(layout.overflow, false, `${width}px page overflow`)
  assert.ok(layout.profileGap >= 1, 'The profile touches the app title')
  assert.ok(layout.profileWidth <= 193, 'The profile exceeds the 12rem brand limit')
  assert.ok(layout.profileAligned, 'The profile is not aligned with the app title')
  assert.ok(layout.profileContained, 'The profile escapes the brand link')
  if (width < 640 && layout.actions.length) {
    const [primary, more] = layout.actions
    assert.ok(Math.abs(primary[2] - more[2]) <= 1, 'Mobile actions have unequal widths')
    assert.equal(primary[1], more[1], 'Mobile actions do not share a row')
    assert.equal(primary[3], more[3], 'Mobile actions have unequal heights')
    assert.ok(more[0] - primary[0] - primary[2] >= 7, 'Mobile actions need an 8px gap')
  }
}

export async function checkHeaderSpacing(page, { surface, width, height, receipts }) {
  const dataset = surface === 'dataset'
  await page.waitForFunction(() => document.querySelector('[aria-label="Active Profile"]')?.textContent.trim())
  const header = page.locator('[data-probe-chrome="header"]')
  if (dataset) await header.waitFor({ state: 'visible' })
  await page.evaluate(() => window.scrollTo(0, 0))
  const resting = await page.evaluate(readLayout, dataset)
  assertLayout(resting, width)
  const originals = await page.evaluate((hasDataset) => {
    const nodes = [document.querySelector('[aria-label="Active Profile"]')]
    if (hasDataset) nodes.push(document.querySelector('[data-probe-chrome="header"] h1'), document.querySelector('[data-probe-chrome="header"] code'))
    return nodes.map((node) => {
      const saved = { text: node.textContent, title: node.getAttribute('title') }
      node.textContent = 'Example'.repeat(12)
      node.setAttribute('title', node.textContent)
      return saved
    })
  }, dataset)
  let stressed
  try {
    stressed = await page.evaluate(readLayout, dataset)
    assertLayout(stressed, width)
  } finally {
    await page.evaluate(({ hasDataset, saved }) => {
      const nodes = [document.querySelector('[aria-label="Active Profile"]')]
      if (hasDataset) nodes.push(document.querySelector('[data-probe-chrome="header"] h1'), document.querySelector('[data-probe-chrome="header"] code'))
      nodes.forEach((node, index) => {
        node.textContent = saved[index].text
        if (saved[index].title === null) node.removeAttribute('title')
        else node.setAttribute('title', saved[index].title)
      })
    }, { hasDataset: dataset, saved: originals })
  }
  if (dataset) {
    const more = header.locator('summary')
    await more.focus()
    await more.hover()
    assert.deepEqual((await page.evaluate(readLayout, true)).landmarks, resting.landmarks, 'Focus or hover moved the header')
    await more.click()
    const opened = await page.evaluate(readLayout, true)
    assertLayout(opened, width)
    assert.deepEqual(opened.landmarks, resting.landmarks, 'Opening More moved the header')
    await more.click()
    assert.deepEqual((await page.evaluate(readLayout, true)).landmarks, resting.landmarks, 'Closing More moved the header')
  }
  if (dataset && (width === 360 || width === 1280)) {
    // Mask data text before capture; no unredacted image or media is saved.
    await page.locator('.app-header').screenshot({ path: path.join(receipts, `header-spacing-${width}-app.png`),
      mask: [page.getByLabel('Active Profile', { exact: true })] })
    await header.screenshot({ path: path.join(receipts, `header-spacing-${width}-dataset.png`),
      mask: [header.locator('h1'), header.locator('code')] })
  }
  return { surface, width, height, profileGap: resting.profileGap,
    controls: resting.controls, overflow: resting.overflow, clipped: resting.clipped,
    small: resting.small, overlaps: resting.overlaps, stressChecked: true, menuChecked: dataset }
}
