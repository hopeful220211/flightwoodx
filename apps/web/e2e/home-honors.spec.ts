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
    await expect(page.locator('#home-hero')).not.toContainText(/3 项|全球设计大奖|77 个|标准化零件|5 步搭完|跟着引导一步步来/)
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
    const title = await page.getByRole('heading', { name: 'FLIGHT', exact: true }).boundingBox()
    const drone = await page.getByRole('img', { name: '主无人机', exact: true }).boundingBox()
    expect(Math.min(...layout.map(image => image.top)), 'Honors now sit below the product stage').toBeGreaterThan(drone!.y + drone!.height)
    expect(title!.y).toBeLessThan(drone!.y)
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

test('honors remain centered as two rows at the narrow tablet breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 1024 })
  await page.goto('/')
  const honors = page.getByRole('group', { name: '获奖荣誉', exact: true })
  await expect(honors).toBeVisible()
  await expect(honors).toHaveCSS('opacity', '1')
  const images = honors.locator('img')
  await expect(images).toHaveCount(4)
  const layout = await images.evaluateAll(elements => elements.map(element => {
    const { left, top, width } = element.getBoundingClientRect()
    return { left, top, width }
  }))
  expect(new Set(layout.map(image => Math.round(image.top))).size).toBe(2)
  expect(new Set(layout.map(image => Math.round(image.width))).size).toBe(1)
  const inkBounds = [[88, 1354], [130, 1311], [45, 1396], [76, 1365]]
  const visibleLeft = (index: number) => layout[index]!.left + layout[index]!.width * inkBounds[index]![0]! / 1440
  const visibleRight = (index: number) => layout[index]!.left + layout[index]!.width * inkBounds[index]![1]! / 1440
  const firstRowCenter = (visibleLeft(0) + visibleRight(1)) / 2
  const secondRowCenter = (visibleLeft(2) + visibleRight(3)) / 2
  expect(Math.abs(firstRowCenter - secondRowCenter)).toBeLessThan(5)
})
