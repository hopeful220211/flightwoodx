import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`registration agreement and brand alignment at ${viewport.width}`, async ({ page, context }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    const posts: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`) })
    page.on('requestfailed', request => {
      if (!request.failure()?.errorText.includes('ERR_ABORTED')) errors.push(new URL(request.url()).pathname)
    })
    context.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname) })
    await page.goto('/register')
    await expect(page).toHaveURL(/\/register$/)
    await expect(page).toHaveTitle(/FlightWoodX/)
    await expect(page.getByRole('heading', { name: '创建账号', exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const metrics = await page.locator('.auth-brand').evaluate(element => {
      const image = element.querySelector('img')!.getBoundingClientRect()
      const text = element.querySelector('span')!.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { imageHeight: image.height, textHeight: text.height, centerOffset: Math.abs(image.y + image.height / 2 - text.y - text.height / 2), gap: text.x - image.right, shadow: style.boxShadow, background: style.backgroundImage }
    })
    expect(metrics).toEqual({ imageHeight: 28, textHeight: 28, centerOffset: 0, gap: 10, shadow: 'none', background: 'none' })
    const intro = await page.locator('.auth-page h1 + p').evaluate(element => {
      const lines = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return [...range.getClientRects()].map(rect => ({ top: rect.top, bottom: rect.bottom }))
      })
      return { text: (element as HTMLElement).innerText, lines }
    })
    expect(intro.text).toBe('注册后可保存无人机设计和程序，\n并在其他设备登录查看。')
    expect(intro.lines).toHaveLength(2)
    expect(intro.lines[0]).toHaveLength(1)
    expect(intro.lines[1]).toHaveLength(1)
    expect(intro.lines[1][0].top).toBeGreaterThanOrEqual(intro.lines[0][0].bottom)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `/tmp/fwx-register-${viewport.width}.png`, fullPage: true })
    const agreement = page.getByRole('checkbox', { name: /我已阅读并同意/ })
    const submit = page.getByRole('button', { name: '创建账号', exact: true })
    await expect(agreement).not.toBeChecked()
    const username = `e2e_${randomBytes(6).toString('hex')}`
    await page.getByLabel('用户名', { exact: true }).fill(username)
    await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`)
    try {
      try { await page.getByLabel('密码', { exact: true }).fill(randomBytes(24).toString('base64url')) }
      catch { throw new Error('Could not fill the isolated registration password field.') }
      await expect(submit).toBeDisabled()
      await page.getByLabel('密码', { exact: true }).press('Enter')
      await expect(page).toHaveURL(/\/register$/)
      expect(posts).not.toContain('/api/auth/register')
      for (const [label, title] of [['《用户使用协议》', '用户使用协议'], ['《隐私政策》', '隐私政策']]) {
        const popupPromise = page.waitForEvent('popup')
        await page.getByRole('link', { name: label, exact: true }).click()
        const popup = await popupPromise
        await expect(popup.getByRole('heading', { name: title, exact: true })).toBeVisible()
        expect(await popup.evaluate(() => window.opener === null)).toBe(true)
        await popup.close()
        await expect(agreement).not.toBeChecked()
        await expect(page.getByLabel('用户名', { exact: true })).toHaveValue(username)
      }
      await agreement.focus()
      await page.keyboard.press('Space')
      await expect(agreement).toBeChecked()
      await expect(submit).toBeEnabled()
      await agreement.uncheck()
      await expect(submit).toBeDisabled()
      await agreement.check()
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register' && response.request().method() === 'POST')
      await submit.click()
      expect((await responsePromise).ok()).toBe(true)
      await expect(page).toHaveURL(/\/dashboard$/)
      await page.reload()
      await expect(page.getByRole('button').filter({ hasText: username })).toBeVisible()
      expect(posts.filter(path => path === '/api/auth/register')).toHaveLength(1)
      expect(posts.some(path => /analytics\/(consent|events)/.test(path))).toBe(false)
      expect(errors).toEqual([])
    } finally {
      if (await page.getByLabel('密码', { exact: true }).count()) await page.getByLabel('密码', { exact: true }).fill('').catch(() => {})
    }
  })
}
