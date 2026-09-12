import { expect, test } from '@playwright/test'

// Read-only homepage checks. The shared config permits only localhost test origins.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`homepage honors remain intact at ${viewport.width}×${viewport.height}`, async ({ page }) => {
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
    await page.goto('/')
    const honors = page.getByRole('button', { name: '查看获奖荣誉', exact: true })
    await expect(honors).toBeVisible()
    await expect(honors.locator('img')).toHaveCount(4)
    await expect.poll(() => honors.locator('img').evaluateAll(images => images.every(image => {
      const element = image as HTMLImageElement
      return element.complete && element.naturalWidth > 0
    }))).toBe(true)

    const layout = await honors.locator('img').evaluateAll(images => images.map(image => {
      const rect = image.getBoundingClientRect()
      return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, ratio: rect.width / rect.height }
    }))
    expect(new Set(layout.map(image => Math.round(image.top))).size).toBe(viewport.width < 640 ? 2 : 1)
    for (const image of layout) {
      expect(image.left).toBeGreaterThanOrEqual(0)
      expect(image.right).toBeLessThanOrEqual(viewport.width)
      expect(image.bottom).toBeLessThanOrEqual(viewport.height)
      expect(image.ratio).toBeCloseTo(2298 / 872, 1)
    }
    const title = await page.getByRole('heading', { name: 'FLIGHT', exact: true }).boundingBox()
    expect(title!.y).toBeGreaterThan(Math.max(...layout.map(image => image.bottom)))
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await expect(page.getByText('Red Dot 2024 · iF 2026 · IDEA', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/G-?Mark/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '开始设计', exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: '观看视频', exact: true })).toBeInViewport()

    if (viewport.width === 768) await honors.press('Enter')
    else await honors.click()
    await expect.poll(() => page.locator('#awards').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(2)
    await expect(page.locator('#awards h3')).toHaveText(['Red Dot', 'iF Design', 'IDEA'])
    expect(failures).toEqual([])
  })
}
