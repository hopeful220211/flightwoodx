import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const fontPath = '/fonts/montserrat-latin-900-normal-v5.2.6.woff2'

async function expectBlackGlyphs(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#home-hero h1' })
    expect(nodeIds).toHaveLength(2)
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      // Inspect actual painted glyphs, not just the requested CSS family.
      expect(fonts).toHaveLength(1)
      // This upstream static file retains the family prefix "MontserratThin";
      // its OS/2 weight class is 900 and its typographic subfamily is Black.
      expect(fonts[0]).toMatchObject({ isCustomFont: true, postScriptName: 'MontserratThin-Black' })
      expect(fonts[0]!.glyphCount).toBeGreaterThan(0)
    }
  } finally {
    await cdp.detach()
  }
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`hero paints real self-hosted Montserrat Black at ${viewport.width}`, async ({ page }) => {
    const failures: string[] = []
    const fontRequests: string[] = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') failures.push(message.text())
    })
    page.on('response', response => {
      if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
    })
    page.on('requestfailed', request => {
      if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(new URL(request.url()).pathname)
    })
    page.on('request', request => {
      if (request.resourceType() === 'font') fontRequests.push(request.url())
    })
    await page.setViewportSize(viewport)
    const fontResponse = page.waitForResponse(response => new URL(response.url()).pathname === fontPath)
    await page.goto('/')
    const response = await fontResponse
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('font/woff2')
    const bytes = await response.body()
    expect(bytes.length).toBe(17984)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('bf2664ac712a67e024d989d18f818136d1a422c0bd5507571dc347a497ad9b61')
    await expect(page).toHaveTitle('FlightWoodX - 木质无人机设计平台')
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await expect(page.locator('#home-hero h1')).toHaveText(['FLIGHT', 'WOOD X'])
    await expectBlackGlyphs(page)

    for (const heading of await page.locator('#home-hero h1').all()) {
      await expect(heading.locator('..')).toHaveCSS('opacity', '1')
      await expect(heading).toHaveCSS('font-weight', '900')
      await expect(heading).toHaveCSS('font-synthesis', 'none')
      const bounds = await heading.evaluate(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const box = range.getBoundingClientRect()
        const parent = element.getBoundingClientRect()
        return { left: box.left, right: box.right, parentLeft: parent.left, parentRight: parent.right, lines: range.getClientRects().length }
      })
      expect(bounds.lines).toBe(1)
      expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft - 1)
      expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight + 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect(fontRequests.filter(url => new URL(url).pathname === fontPath)).toHaveLength(1)
    expect(fontRequests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
    await expect(page.locator(`link[rel="preload"][href="${fontPath}"]`)).toHaveAttribute('as', 'font')
    const captureDir = process.env.FWX_UI_CAPTURE_DIR
    if (captureDir) {
      await mkdir(captureDir, { recursive: true })
      await expect(page.getByRole('button', { name: '观看视频', exact: true }).locator('..')).toHaveCSS('opacity', '1')
      await page.screenshot({ path: join(captureDir, `montserrat-black-${viewport.width}.png`) })
    }
    await page.getByRole('button', { name: '观看视频', exact: true }).click()
    await expect(page.getByRole('region', { name: '产品视频', exact: true }).locator('video')).toBeVisible()
    await page.reload()
    await expect(page.locator('#home-hero h1')).toHaveText(['FLIGHT', 'WOOD X'])
    await expectBlackGlyphs(page)
    expect(failures).toEqual([])
  })
}

test('font download failure preserves readable titles and a reload restores Black', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(`**${fontPath}`, route => route.abort())
  await page.goto('/')
  await expect(page.locator('#home-hero h1')).toHaveText(['FLIGHT', 'WOOD X'])
  await expect(page.getByRole('button', { name: '开始设计', exact: true })).toBeVisible()
  await page.unroute(`**${fontPath}`)
  await page.reload()
  await expect(page.locator('#home-hero h1')).toHaveText(['FLIGHT', 'WOOD X'])
  await expectBlackGlyphs(page)
})
