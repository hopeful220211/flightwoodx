import { expect, test } from '@playwright/test'
import { join } from 'node:path'

const records = [
  { name: '渝ICP备2026006667号-2', url: 'https://beian.miit.gov.cn/' },
  { name: '渝公网安备50010502504712号', url: 'https://beian.mps.gov.cn/#/query/webSearch?code=50010502504712' },
]

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`footer filings remain readable and open official links at ${viewport.width}×${viewport.height}`, async ({ page, context }) => {
    const failures: string[] = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
    page.on('response', response => {
      if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
    })
    page.on('requestfailed', request => {
      if (!request.failure()?.errorText.includes('ERR_ABORTED')) failures.push(new URL(request.url()).pathname)
    })
    // Verify real link activation without making CI depend on government sites or their captchas.
    // This proves the navigation destination, not availability of the external query service.
    for (const host of ['beian.miit.gov.cn', 'beian.mps.gov.cn']) {
      await context.route(`https://${host}/**`, route => route.fulfill({
        contentType: 'text/plain', body: 'External filing query navigation captured by test.',
      }))
    }

    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page).toHaveTitle('FlightWoodX - 木质无人机设计平台')
    await expect(page.locator('#home-hero')).toContainText('翼想飞木无人机搭建平台')
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    const footer = page.getByRole('contentinfo')
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toContainText('芬奇答奥（重庆）科技有限公司')
    await expect(footer).not.toContainText(/待备案|渝ICP备2026006667号-1/)

    const badge = footer.getByRole('img', { name: '公安备案图标' })
    await expect(badge).toBeVisible()
    await expect.poll(() => badge.evaluate(image => {
      const img = image as HTMLImageElement
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
    })).toBe(true)
    await expect(badge).toHaveAttribute('src', '/filing/public-security.png')
    const badgeBounds = (await badge.boundingBox())!
    expect(badgeBounds.width).toBe(20)
    expect(badgeBounds.height).toBe(20)
    const response = await page.request.get('/filing/public-security.png')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
    expect((await response.body()).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

    for (const record of records) {
      const link = footer.getByRole('link', { name: record.name })
      await expect(link).toBeInViewport()
      await expect(link).toHaveAttribute('href', record.url)
      const bounds = (await link.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(16)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 16)
      expect(bounds.height).toBe(24)
      await link.focus()
      await expect(link).toBeFocused()
      const popupPromise = page.waitForEvent('popup')
      await page.keyboard.press('Enter')
      const popup = await popupPromise
      await expect(popup).toHaveURL(record.url)
      expect(await popup.evaluate(() => window.opener === null)).toBe(true)
      await popup.close()
    }
    expect(new URL(page.url()).pathname).toBe('/')
    await page.reload()
    await expect(footer.getByRole('link', { name: records[0]!.name })).toBeVisible()
    await footer.scrollIntoViewIfNeeded()
    await expect(badge).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await footer.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `footer-${viewport.width}.png`), animations: 'disabled' })
    }
    expect(failures).toEqual([])
  })
}
