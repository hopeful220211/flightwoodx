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
    const honors = page.getByRole('group', { name: '获奖荣誉', exact: true })
    await expect(honors).toBeVisible()
    await expect(honors).toHaveCSS('opacity', '1')
    await expect(honors.locator('img')).toHaveCount(4)
    await expect.poll(() => honors.locator('img').evaluateAll(images => images.every(image => {
      const element = image as HTMLImageElement
      return element.complete && element.naturalWidth > 0
    }))).toBe(true)

    const layout = await honors.locator('img').evaluateAll(images => images.map(image => {
      const rect = image.getBoundingClientRect()
      return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, ratio: rect.width / rect.height }
    }))
    expect(new Set(layout.map(image => Math.round(image.top))).size).toBe(viewport.width < 640 ? 2 : 1)
    for (const image of layout) {
      expect(image.left).toBeGreaterThanOrEqual(0)
      expect(image.right).toBeLessThanOrEqual(viewport.width)
      expect(image.bottom).toBeLessThanOrEqual(viewport.height)
      expect(image.ratio).toBeCloseTo(2298 / 872, 1)
    }
    // Visible alpha bounds of the supplied 1440px WebP assets, not their transparent canvases.
    const inkBounds = [[88, 1354], [130, 1311], [45, 1396], [76, 1365]]
    const gaps = (viewport.width < 640 ? [0, 2] : [0, 1, 2]).map(index => {
      const currentRight = layout[index]!.left + layout[index]!.width * inkBounds[index]![1]! / 1440
      const nextLeft = layout[index + 1]!.left + layout[index + 1]!.width * inkBounds[index + 1]![0]! / 1440
      return nextLeft - currentRight
    })
    expect.soft(Math.max(...gaps) - Math.min(...gaps), 'Visible spacing should match the third-to-fourth pair').toBeLessThan(1)
    expect(Math.min(...gaps), 'The laurels must not overlap').toBeGreaterThan(8)
    const parent = await honors.locator('..').boundingBox()
    const button = await honors.boundingBox()
    expect.soft(button!.y - parent!.y, 'Move the honors down without moving the whole hero').toBeGreaterThanOrEqual(8)
    const previousImageWidth = viewport.width < 640 ? (parent!.width - 12) / 2 : (parent!.width - 24) / 4
    for (const image of layout) {
      expect.soft(image.width, 'Each image should be slightly larger than the previous layout').toBeGreaterThan(previousImageWidth * 1.02)
    }
    if (viewport.width >= 640) {
      const referenceGap = 8 + previousImageWidth / 12
      expect(Math.abs(gaps[2]! - referenceGap), 'Keep the third-to-fourth reference gap nearly unchanged').toBeLessThan(2)
    }
    const title = await page.getByRole('heading', { name: 'FLIGHT', exact: true }).boundingBox()
    expect(title!.y).toBeGreaterThan(Math.max(...layout.map(image => image.bottom)))
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await expect(page.getByText('Red Dot 2024 · iF 2026 · IDEA', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/G-?Mark/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '开始设计', exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: '观看视频', exact: true })).toBeInViewport()

    await expect(page.locator('#awards')).toHaveCount(0)
    await expect(page.getByText('这几个国际设计奖，我们拿到了', { exact: true })).toHaveCount(0)
    expect(failures).toEqual([])
  })
}
