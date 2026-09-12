import { expect, test } from '@playwright/test'

const videoPath = '/resource/videos/flightwoodx-introduction.mp4'

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`homepage video plays at the section boundary at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const failures: string[] = []
    const mediaRequests: string[] = []
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
      if (request.resourceType() === 'media') mediaRequests.push(new URL(request.url()).pathname)
    })
    await page.setViewportSize(viewport)
    await page.goto('/')
    const drone = page.getByRole('img', { name: '主无人机', exact: true })
    expect((await drone.boundingBox())!.width, 'Keep the hero artwork visible above the new video').toBeGreaterThan(150)
    const preview = page.getByRole('button', { name: '播放视频', exact: true })
    await expect(preview).toBeVisible()
    await preview.scrollIntoViewIfNeeded()
    await expect.poll(() => preview.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    expect(mediaRequests).toEqual([])
    await expect(page.locator('video')).toHaveCount(0)

    const hero = await page.locator('#home-hero').boundingBox()
    const poster = await preview.boundingBox()
    expect(poster!.width / poster!.height).toBeCloseTo(16 / 9, 1)
    expect(poster!.x).toBeGreaterThanOrEqual(16)
    expect(poster!.x + poster!.width).toBeLessThanOrEqual(viewport.width - 16)
    const boundary = hero!.y + hero!.height
    expect(boundary - poster!.y).toBeGreaterThan(poster!.height * 0.15)
    expect(boundary - poster!.y).toBeLessThan(poster!.height * 0.4)
    const next = page.getByRole('heading', { name: '不只是又一个 STEAM 玩具' })
    expect((await next.boundingBox())!.y).toBeGreaterThan(poster!.y + poster!.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    if (viewport.width === 768) await preview.press('Enter')
    else await preview.click()

    const dialog = page.getByRole('dialog', { name: 'FlightWoodX 产品演示' })
    await expect(dialog).toBeVisible()
    const video = dialog.locator('video')
    await expect(video).toHaveAttribute('src', videoPath)
    await expect(video).toHaveAttribute('playsinline', '')
    await expect(video).toHaveAttribute('controls', '')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20000 }).toBeGreaterThan(0.2)
    expect(await video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight, error: element.error?.code ?? null })))
      .toEqual({ width: 1920, height: 1080, error: null })
    const modal = await dialog.boundingBox()
    expect(modal!.y).toBeGreaterThanOrEqual(0)
    expect(modal!.y + modal!.height).toBeLessThanOrEqual(viewport.height)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('video')).toHaveCount(0)
    await expect(preview).toBeFocused()

    const heroWatch = page.getByRole('button', { name: '观看视频', exact: true })
    await heroWatch.click()
    await expect(dialog.locator('video')).toHaveAttribute('src', videoPath)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(heroWatch).toBeFocused()
    expect(mediaRequests.length).toBeGreaterThan(0)
    expect(mediaRequests.every(path => path === videoPath)).toBe(true)
    expect(failures).toEqual([])
  })
}

test('homepage video can recover from an unavailable media file', async ({ page }) => {
  await page.route(`**${videoPath}`, route => route.abort('failed'))
  await page.goto('/')
  await page.getByRole('button', { name: '播放视频', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'FlightWoodX 产品演示' })
  await expect(dialog.getByRole('alert')).toBeVisible()
  await page.unroute(`**${videoPath}`)
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => dialog.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20000 }).toBeGreaterThan(0.2)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('video stays usable in phone landscape and prevents focus reaching background controls', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '观看视频', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'FlightWoodX 产品演示' })
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds!.y).toBeGreaterThanOrEqual(16)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390 - 16)
  const close = dialog.getByRole('button', { name: '关闭', exact: true })
  await expect(close).toBeFocused()
  await trigger.focus()
  await expect(close).toBeFocused()
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let index = 0; index < 20; index++) {
      await page.keyboard.press(key)
      const focus = await dialog.evaluate(element => ({
        tag: document.activeElement?.tagName,
        pageFocused: document.hasFocus(),
        inside: element.contains(document.activeElement),
        modal: element.matches(':modal'),
      }))
      expect(focus.modal).toBe(true)
      // Native Chrome permits Tab to its own UI. It reports BODY plus a
      // defocused document, not a focusable background element in the page.
      expect(focus.inside || (focus.tag === 'BODY' && !focus.pageFocused), JSON.stringify({ key, index, ...focus })).toBe(true)
    }
  }
  await page.mouse.click(4, 4)
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.locator('video')).toHaveCount(0)
})
