import { expect, test } from '@playwright/test'

const videoPath = '/resource/videos/flightwoodx-introduction.mp4'

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`homepage video plays inline without changing its frame at ${viewport.width}×${viewport.height}`, async ({ page }) => {
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
    expect.soft(poster!.width, 'Use the compact 605px reference width').toBeLessThanOrEqual(605)
    if (viewport.width >= 768) expect(poster!.width).toBeCloseTo(605, 0)
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

    await expect(page.getByRole('dialog')).toHaveCount(0)
    const video = page.getByRole('region', { name: '产品视频', exact: true }).locator('video')
    await expect(video).toBeVisible()
    await expect(video).toHaveAttribute('src', videoPath)
    await expect(video).toHaveAttribute('playsinline', '')
    await expect(video).toHaveAttribute('controls', '')
    await expect(video).toBeFocused()
    const playing = (await video.boundingBox())!
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(playing[key] - poster![key]), `Inline playback must preserve ${key}`).toBeLessThan(1)
    }
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20000 }).toBeGreaterThan(0.2)
    expect(await video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight, error: element.error?.code ?? null })))
      .toEqual({ width: 1920, height: 1080, error: null })
    await video.press('Space')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
    const pausedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    await video.press('Space')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(pausedAt + 0.2)
    await video.press('Space')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
    const resumeAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    const existingPlayer = await video.elementHandle()
    await page.getByRole('button', { name: '观看视频', exact: true }).click()
    await expect(video).toBeInViewport({ ratio: 0.99 })
    await expect(video).toBeFocused()
    expect(await video.evaluate((element, existing) => element === existing, existingPlayer)).toBe(true)
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(resumeAt + 0.2)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(mediaRequests.length).toBeGreaterThan(0)
    expect(mediaRequests.every(path => path === videoPath)).toBe(true)
    expect(failures).toEqual([])
  })
}

test('inline video retries in the same frame after an unavailable media file', async ({ page }) => {
  await page.route(`**${videoPath}`, route => route.abort('failed'))
  await page.goto('/')
  await page.getByRole('button', { name: '播放视频', exact: true }).click()
  const region = page.getByRole('region', { name: '产品视频', exact: true })
  await expect(region.getByRole('alert')).toBeVisible()
  const retry = region.getByRole('button', { name: '重试', exact: true })
  await expect(retry).toBeFocused()
  await retry.press('Shift+Tab')
  await expect(page.getByRole('button', { name: '观看视频', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(retry).toBeFocused()
  const failedFrame = await region.boundingBox()
  await page.unroute(`**${videoPath}`)
  await region.getByRole('button', { name: '重试', exact: true }).click()
  await expect.poll(() => region.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20000 }).toBeGreaterThan(0.2)
  await expect(region.getByRole('alert')).toHaveCount(0)
  expect(await region.boundingBox()).toEqual(failedFrame)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a delayed media error preserves focus outside the player', async ({ page }) => {
  let failMedia!: () => void
  const released = new Promise<void>(resolve => { failMedia = resolve })
  await page.route(`**${videoPath}`, async route => {
    await released
    await route.abort('failed')
  })
  await page.goto('/')
  await page.getByRole('button', { name: '播放视频', exact: true }).click()
  const region = page.getByRole('region', { name: '产品视频', exact: true })
  await expect(region.locator('video')).toBeFocused()
  const outside = page.getByRole('button', { name: '观看视频', exact: true })
  await outside.focus()
  failMedia()
  await expect(region.getByRole('alert')).toBeVisible()
  await expect(outside).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(region.getByRole('button', { name: '重试', exact: true })).toBeFocused()
})

test('hero watch button starts the same inline player in phone landscape', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '观看视频', exact: true })
  await trigger.click()
  const video = page.getByRole('region', { name: '产品视频', exact: true }).locator('video')
  await expect(video).toBeVisible()
  await expect(video).toBeInViewport({ ratio: 0.99 })
  const bounds = (await video.boundingBox())!
  expect(bounds.height).toBeLessThanOrEqual(390 - 128)
  expect(bounds.width / bounds.height).toBeCloseTo(16 / 9, 1)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20000 }).toBeGreaterThan(0.2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Inline playback must leave the rest of the homepage interactive.
  await trigger.focus()
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})
