import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`award banner is full-width, readable and source-linked at ${viewport.width}`, async ({ page, context }) => {
    const failures: string[] = []
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
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page).toHaveTitle(/FlightWoodX/)
    await expect(page.locator('#home-hero')).toBeVisible()
    await expect(page.getByRole('group', { name: '获奖荣誉', exact: true }).locator('img')).toHaveCount(4)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)

    const banner = page.getByRole('region', { name: '作品获奖', exact: true })
    await banner.scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready)
    await expect(banner).toBeInViewport({ ratio: 1 })
    await expect(banner).toHaveCSS('background-color', 'rgb(48, 54, 59)')
    await expect(banner.locator('a')).toHaveCount(3)
    await expect(banner).toContainText('鲲鹏奖工业设计概念组金奖')
    await expect(banner.locator('button, img, video')).toHaveCount(0)
    const bounds = await banner.evaluate(element => {
      const box = element.getBoundingClientRect()
      const parent = element.parentElement!.getBoundingClientRect()
      return {
        left: box.left, right: box.right, height: box.height, parentWidth: parent.width, width: box.width,
        links: [...element.querySelectorAll('a')].map(link => {
          const rect = link.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top - box.top, bottom: rect.bottom - box.top }
        }),
      }
    })
    expect(bounds.left).toBe(0)
    expect(bounds.width).toBe(bounds.parentWidth)
    expect(bounds.height).toBeGreaterThan(180)
    expect(bounds.height).toBeLessThan(400)
    for (const link of bounds.links) {
      expect(link.left).toBeGreaterThanOrEqual(20)
      expect(link.right).toBeLessThanOrEqual(bounds.right - 20)
      expect(link.top).toBeGreaterThan(20)
      expect(link.bottom).toBeLessThan(bounds.height - 20)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)

    const captureDir = process.env.FWX_UI_CAPTURE_DIR
    if (captureDir) {
      await mkdir(captureDir, { recursive: true })
      await banner.screenshot({ path: join(captureDir, `award-banner-${viewport.width}.png`) })
      await page.screenshot({ path: join(captureDir, `award-context-${viewport.width}.png`) })
    }

    // Verify destination and safe keyboard navigation, not external service availability.
    await context.route('https://www.red-dot.org/project/flightwood-x-83079', route => route.fulfill({ contentType: 'text/html', body: '<title>Award record</title>' }))
    const firstLink = banner.getByRole('link', { name: '红点设计概念奖（主办方记录，新窗口打开）' })
    await firstLink.focus()
    await expect(firstLink).toBeFocused()
    const opened = page.waitForEvent('popup')
    await page.keyboard.press('Enter')
    const popup = await opened
    await popup.waitForLoadState()
    expect(popup.url()).toBe('https://www.red-dot.org/project/flightwood-x-83079')
    expect(await popup.evaluate(() => window.opener === null)).toBe(true)
    await popup.close()
    await expect(banner).toBeVisible()
    expect(failures).toEqual([])
  })
}
