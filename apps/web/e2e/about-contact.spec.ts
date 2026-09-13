import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'

const wechatId = 'ccccckd0211'
const phoneText = '+86 18393648803'
const teamAlt = 'FlightWoodX 团队与木质无人机作品合影'
const footerEntries = [
  { name: '关于我们', href: '/about' },
  { name: '联系我们', href: '/about#contact' },
  { name: '合作入口', href: '/about#contact' },
]

function observePage(page: Page) {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })
  page.on('requestfailed', request => {
    // Navigation between the homepage and About may cancel pending local images/media.
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) {
      failures.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`)
    }
  })
  return failures
}

async function expectAboutPage(page: Page) {
  await expect(page).toHaveTitle(/FlightWoodX/)
  await expect(page.getByRole('heading', { name: '关于我们', level: 1, exact: true })).toBeVisible()
  for (const name of ['公司介绍', '我们的团队', '作品获奖', '联系我们']) {
    await expect(page.getByRole('heading', { name, level: 2, exact: true })).toHaveCount(1)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('main form')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
}

async function expectContactReady(page: Page) {
  await expect(page).toHaveURL(/\/about#contact$/)
  const contact = page.getByRole('region', { name: '联系我们', exact: true })
  await expect(contact).toHaveAttribute('id', 'contact')
  await expect(contact).toHaveAttribute('tabindex', '-1')
  await expect(contact).toBeFocused()
  const heading = contact.getByRole('heading', { name: '联系我们', level: 2, exact: true })
  const phone = contact.getByRole('link', { name: phoneText, exact: true })
  const wechat = contact.getByText(wechatId, { exact: true })
  await expect(heading).toBeInViewport({ ratio: 1 })
  await expect.poll(async () => (await heading.boundingBox())!.y, {
    message: 'The contact heading must not be covered by the fixed 64px navigation bar',
  }).toBeGreaterThanOrEqual(64)
  await expect(phone).toBeInViewport({ ratio: 1 })
  await expect(phone).toHaveAttribute('href', 'tel:+8618393648803')
  await expect(wechat).toBeInViewport({ ratio: 1 })
  for (const element of [phone, wechat]) {
    const bounds = (await element.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(16)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width - 16)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  return contact
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`about and contact links, full team image and clipboard work at ${viewport.width}×${viewport.height}`, async ({ page, context, baseURL }) => {
    const failures = observePage(page)
    await page.setViewportSize(viewport)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin })

    for (const entry of footerEntries) {
      await page.goto('/')
      await expect(page.locator('#home-hero')).toContainText('翼想飞木无人机搭建平台')
      const footer = page.getByRole('contentinfo')
      await footer.scrollIntoViewIfNeeded()
      const link = footer.getByRole('link', { name: entry.name, exact: true })
      await expect(link).toHaveAttribute('href', entry.href)
      await link.click()
      await expect(page).toHaveURL(new URL(entry.href, baseURL!).href)
      await expectAboutPage(page)
      if (entry.href.endsWith('#contact')) await expectContactReady(page)
      else await expect(page.getByRole('heading', { name: '关于我们', level: 1, exact: true })).toBeInViewport({ ratio: 1 })
      await page.goBack()
      await expect(page).toHaveURL(new URL('/', baseURL!).href)
      await expect(page.locator('#home-hero')).toContainText('翼想飞木无人机搭建平台')
    }

    // A direct visit and refresh must work without first loading homepage state.
    await page.goto('/about')
    await expectAboutPage(page)
    await page.reload()
    await expectAboutPage(page)
    const title = page.getByRole('heading', { name: '关于我们', level: 1, exact: true })
    await expect(title).toBeInViewport({ ratio: 1 })
    await page.evaluate(() => document.fonts.ready)
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await page.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `about-top-${viewport.width}.png`) })
    }

    const team = page.getByRole('img', { name: teamAlt, exact: true })
    await team.scrollIntoViewIfNeeded()
    await expect(team).toBeVisible()
    await expect.poll(() => team.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)).toBe(true)
    expect(await team.evaluate(image => getComputedStyle(image).objectFit)).toBe('contain')
    const imageBounds = (await team.boundingBox())!
    expect(imageBounds.x).toBeGreaterThanOrEqual(0)
    expect(imageBounds.x + imageBounds.width).toBeLessThanOrEqual(viewport.width)
    expect(await team.evaluate(image => image.clientWidth <= image.parentElement!.clientWidth)).toBe(true)
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await team.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `about-team-${viewport.width}.png`) })
    }

    // Same-page navigation must move keyboard focus along with the viewport.
    for (const destination of ['/about', '/about#contact']) {
      await page.goto(destination)
      await expectAboutPage(page)
      const footer = page.getByRole('contentinfo')
      await footer.scrollIntoViewIfNeeded()
      await footer.getByRole('link', { name: '关于我们', exact: true }).press('Enter')
      await expect(page).toHaveURL(new URL('/about', baseURL!).href)
      await expect(title).toBeFocused()
      await expect(title).toBeInViewport({ ratio: 1 })
      await page.keyboard.press('Tab')
      await expect(page.locator('main header').getByRole('link', { name: '联系我们', exact: true })).toBeFocused()
    }

    // Both links must scroll and focus even when the URL already has the same hash.
    for (const name of ['联系我们', '合作入口', '联系我们']) {
      const footer = page.getByRole('contentinfo')
      await footer.scrollIntoViewIfNeeded()
      await footer.getByRole('link', { name, exact: true }).press('Enter')
      await expectContactReady(page)
    }
    await page.reload()
    await expectAboutPage(page)
    const contact = await expectContactReady(page)
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await contact.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `about-contact-${viewport.width}.png`) })
    }

    // Seed a known value so a previous successful copy cannot hide a broken button.
    await page.evaluate(() => navigator.clipboard.writeText('flightwoodx-contact-copy-test'))
    await contact.getByRole('button', { name: '复制微信号', exact: true }).click()
    await expect(contact.getByRole('status')).toHaveText('已复制微信号')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(wechatId)
    await expect(contact.getByRole('link', { name: phoneText, exact: true })).toHaveAttribute('href', 'tel:+8618393648803')
    expect(failures).toEqual([])
  })
}

test('clipboard refusal keeps contact information visible and explains manual copying', async ({ page }) => {
  const failures = observePage(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Clipboard intentionally denied by test', 'NotAllowedError')),
    })
  })
  await page.goto('/about#contact')
  await expectAboutPage(page)
  const contact = await expectContactReady(page)
  await contact.getByRole('button', { name: '复制微信号', exact: true }).press('Enter')
  await expect(contact.getByRole('status')).toHaveText('复制失败，请长按或选中微信号复制。')
  await expect(contact.getByText(wechatId, { exact: true })).toBeVisible()
  await expect(contact.getByRole('link', { name: phoneText, exact: true })).toHaveAttribute('href', 'tel:+8618393648803')
  await expect(contact.getByRole('button', { name: '复制微信号', exact: true })).toBeEnabled()
  expect(failures).toEqual([])
})
