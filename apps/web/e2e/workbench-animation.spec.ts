import { expect, test, type Locator, type Page } from '@playwright/test'
import { join } from 'node:path'

const videoPath = '/resource/videos/design-workbench-loop.mp4'
const posterPath = '/resource/videos/design-workbench-loop.webp'

function observePage(page: Page, allowMediaFailure: () => boolean = () => false) {
  const failures: string[] = []
  const mediaRequests: string[] = []
  const expectedFailures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const url = message.location().url
    if (allowMediaFailure() && url && new URL(url).pathname === videoPath
      && message.text().includes('Failed to load resource')) {
      expectedFailures.push(message.text())
    } else failures.push(message.text())
  })
  page.on('request', request => {
    if (new URL(request.url()).pathname === videoPath) mediaRequests.push(request.url())
  })
  page.on('response', response => {
    if (response.status() < 400) return
    const path = new URL(response.url()).pathname
    const message = `${response.status()} ${path}`
    if (allowMediaFailure() && path === videoPath) expectedFailures.push(message)
    else failures.push(message)
  })
  page.on('requestfailed', request => {
    const path = new URL(request.url()).pathname
    const message = `${path}: ${request.failure()?.errorText}`
    if (allowMediaFailure() && path === videoPath) expectedFailures.push(message)
    // Browsers can cancel an in-flight range when this silent media is paused.
    else if (!(path === videoPath && request.failure()?.errorText.includes('ERR_ABORTED'))) failures.push(message)
  })
  return { failures, mediaRequests, expectedFailures }
}

async function expectTimeAdvancing(video: Locator, from = 0) {
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20_000 })
    .toBeGreaterThan(from + 0.2)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
}

async function expectTimeStopped(video: Locator) {
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
  const drift = await video.evaluate(async (element: HTMLVideoElement) => {
    const started = performance.now()
    const at = element.currentTime
    await new Promise<void>(resolve => {
      const tick = () => performance.now() - started >= 350 ? resolve() : requestAnimationFrame(tick)
      requestAnimationFrame(tick)
    })
    return Math.abs(element.currentTime - at)
  })
  expect(drift, 'A paused animation must not advance in the background').toBeLessThan(0.02)
}

async function openHomepage(page: Page) {
  await page.goto('/')
  await expect(page).toHaveTitle('FlightWoodX - 木质无人机设计平台')
  await expect(page.locator('#home-hero')).toContainText('翼想飞木无人机搭建平台')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  const frame = page.getByRole('group', { name: '设计工作台演示动画', exact: true })
  await expect(frame).toHaveCount(1)
  return { frame, video: frame.locator('video') }
}

async function revealAnimation(frame: Locator) {
  await frame.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  // Wait for the existing entry transition before Playwright scrolls a nested button.
  // Otherwise its actionability scroll can leave the frame and change Pause to Play.
  await expect.poll(() => frame.evaluate(element => {
    const reveal = element.parentElement!.parentElement!
    const style = getComputedStyle(reveal)
    return style.opacity === '1'
      && (style.transform === 'none' || new DOMMatrixReadOnly(style.transform).isIdentity)
  })).toBe(true)
  await expect(frame.getByRole('button')).toBeInViewport({ ratio: 1 })
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`workbench animation plays inline, pauses and loops at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    const observed = observePage(page)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const { frame, video } = await openHomepage(page)
    await expect(video).toHaveAttribute('src', videoPath)
    await expect(video).toHaveAttribute('poster', posterPath)
    await expect(video).toHaveAttribute('preload', 'none')
    await expect(frame).not.toBeInViewport()
    await expectTimeStopped(video)
    expect(observed.mediaRequests, 'Below-fold animation must not download on initial load').toEqual([])

    // The design-card keeps the previous image's layout; perspective affects its visual bounds.
    const untransformedRatio = await frame.evaluate(element => element.clientWidth / element.clientHeight)
    expect(untransformedRatio).toBeCloseTo(1440 / 1001, 2)
    await revealAnimation(frame)
    await expect(frame.getByRole('button', { name: '暂停演示动画', exact: true })).toBeVisible()
    await expectTimeAdvancing(video)
    const before = (await frame.boundingBox())!
    expect(before.x).toBeGreaterThanOrEqual(0)
    expect(before.x + before.width).toBeLessThanOrEqual(viewport.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect(await video.evaluate((element: HTMLVideoElement) => ({
      width: element.videoWidth,
      height: element.videoHeight,
      muted: element.muted,
      loop: element.loop,
      inline: element.playsInline,
      controls: element.controls,
      error: element.error?.code ?? null,
      objectFit: getComputedStyle(element).objectFit,
    }))).toEqual({ width: 1440, height: 864, muted: true, loop: true, inline: true, controls: false, error: null, objectFit: 'contain' })
    expect(await video.evaluate((element: HTMLVideoElement) => element.duration)).toBeCloseTo(11.49, 1)
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await frame.getByRole('button', { name: '暂停演示动画', exact: true }).click()
    await expectTimeStopped(video)
    const pausedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    const play = frame.getByRole('button', { name: '播放演示动画', exact: true })
    if (viewport.width === 768) await play.press('Enter')
    else await play.click()
    await expectTimeAdvancing(video, pausedAt)

    // Seek near the real asset's end and observe the browser's native loop wrap.
    await video.evaluate((element: HTMLVideoElement) => { element.currentTime = element.duration - 0.15 })
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20_000 }).toBeLessThan(1)
    await expectTimeAdvancing(video)
    const after = (await frame.boundingBox())!
    expect(Math.abs(before.width - after.width)).toBeLessThan(1)
    expect(Math.abs(before.height - after.height)).toBeLessThan(1)

    if (process.env.FWX_UI_CAPTURE_DIR) {
      await frame.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `workbench-animation-${viewport.width}.png`) })
    }

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(frame).not.toBeInViewport()
    await expectTimeStopped(video)
    await revealAnimation(frame)
    await expectTimeAdvancing(video)
    await frame.getByRole('button', { name: '暂停演示动画', exact: true }).click()
    await expectTimeStopped(video)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(frame).not.toBeInViewport()
    await revealAnimation(frame)
    await expectTimeStopped(video)
    await expect(frame.getByRole('button', { name: '播放演示动画', exact: true })).toBeVisible()

    const section = frame.locator('xpath=ancestor::section')
    await expect(section.getByRole('heading', { name: '设计工作台', exact: true })).toBeVisible()
    await expect(section).toContainText('浏览零件、调整位置并预览三维结构。登录后可保存作品、继续编程或导出设计记录。目前不提供切割图。')
    await expect(section).toContainText('分步引导与自由拼装')
    expect(observed.mediaRequests.length).toBeGreaterThan(0)
    expect(observed.failures).toEqual([])
  })
}

test('reduced-motion preference keeps the workbench poster still until manual playback', async ({ page }) => {
  const observed = observePage(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { frame, video } = await openHomepage(page)
  await revealAnimation(frame)
  await expect(video).toBeVisible()
  await expect(video).toHaveAttribute('poster', posterPath)
  await expectTimeStopped(video)
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBe(0)
  expect(observed.mediaRequests).toEqual([])
  await frame.getByRole('button', { name: '播放演示动画', exact: true }).press('Enter')
  await expectTimeAdvancing(video)
  await frame.getByRole('button', { name: '暂停演示动画', exact: true }).press('Enter')
  await expectTimeStopped(video)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(observed.failures).toEqual([])
})

test('workbench playback follows live motion preference changes without overriding manual pause', async ({ page }) => {
  const observed = observePage(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const { frame, video } = await openHomepage(page)
  await revealAnimation(frame)
  await expectTimeAdvancing(video)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectTimeStopped(video)
  await expect(frame.getByRole('button', { name: '播放演示动画', exact: true })).toBeVisible()
  const pausedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expectTimeAdvancing(video, pausedAt)

  await frame.getByRole('button', { name: '暂停演示动画', exact: true }).click()
  await expectTimeStopped(video)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectTimeStopped(video)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expectTimeStopped(video)
  await expect(frame.getByRole('button', { name: '播放演示动画', exact: true })).toBeVisible()
  expect(observed.failures).toEqual([])
})

test('failed workbench media retains a poster and can retry in place', async ({ page }) => {
  let blocking = true
  const observed = observePage(page, () => blocking)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route(`**${videoPath}`, route => route.abort('failed'))
  const { frame, video } = await openHomepage(page)
  await revealAnimation(frame)
  await expect(frame.getByRole('status')).toHaveText('演示加载失败，请重试。')
  await expect(video).toBeHidden()
  const poster = frame.getByRole('img', { name: '设计工作台演示封面', exact: true })
  await expect(poster).toBeVisible()
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  expect(observed.expectedFailures.length, 'The test must exercise a genuine failed media request').toBeGreaterThan(0)
  const before = (await frame.boundingBox())!
  if (process.env.FWX_UI_CAPTURE_DIR) {
    await frame.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, 'workbench-animation-retry.png') })
  }
  await page.unroute(`**${videoPath}`)
  blocking = false
  await frame.getByRole('button', { name: '重新加载演示动画', exact: true }).press('Enter')
  await expect(video).toBeVisible()
  await expectTimeAdvancing(video)
  await expect(frame.getByRole('status')).toHaveCount(0)
  const after = (await frame.boundingBox())!
  expect(Math.abs(before.width - after.width)).toBeLessThan(1)
  expect(Math.abs(before.height - after.height)).toBeLessThan(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(observed.failures).toEqual([])
})
