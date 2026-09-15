import { expect, test } from '@playwright/test'

const sizes = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]

for (const viewport of sizes) {
  test(`reference typography, media, navigation and application controls at ${viewport.width}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveTitle(/FlightWoodX/)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await expect(page.locator('body')).toHaveCSS('font-family', '"Open Sans", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", "Hiragino Sans GB", "WenQuanYi Micro Hei", Arial, sans-serif')
    await expect(page.locator('body')).toHaveCSS('font-size', '16px')
    await expect(page.locator('.site-nav-inner')).toHaveCSS('height', '64px')
    await expect(page.locator('.site-nav-brand img')).toHaveCSS('object-fit', 'contain')
    await expect(page.getByRole('button', { name: '开始设计', exact: true })).toHaveCSS('border-radius', '64px')
    await expect(page.getByRole('button', { name: '开始设计', exact: true })).toHaveCSS('background-color', 'rgb(0, 112, 213)')
    for (const title of await page.locator('#home-hero h1').all()) {
      await expect(title).toHaveCSS('font-weight', '900')
      await expect(title).toHaveCSS('font-synthesis', 'none')
    }
    await page.getByRole('heading', { name: '平台功能', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.locator('.home-feature-image').first()).toHaveCSS('border-radius', '0px')
    await expect(page.locator('.site-section-title').first()).toHaveCSS('font-size', `${viewport.width < 768 ? 28 : viewport.width < 1024 ? 32 : 40}px`)
    await expect(page.locator('.site-section-title').first()).toHaveCSS('font-weight', '600')
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
    await expect(page.getByRole('contentinfo')).toHaveCSS('background-color', 'rgb(39, 39, 39)')
    await page.getByRole('contentinfo').getByRole('link', { name: '关于我们', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { name: '关于我们', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '联系我们', exact: true }).first().click()
    await expect(page.locator('#contact')).toBeFocused()
    await expect(page.getByRole('button', { name: '复制微信号', exact: true })).toBeVisible()
    for (const path of ['/community', '/community/leaderboard', '/privacy', '/privacy/policy', '/register']) {
      await page.goto(path)
      await expect(page.locator('h1')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const fonts = await page.locator('h1').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).fontFamily))
      expect(fonts.every(font => font.startsWith('"Open Sans"'))).toBe(true)
    }
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await expect(page.getByRole('heading', { name: '我的作品', exact: true })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: '搜索作品', exact: true })).toHaveCSS('border-radius', '6px')
    await page.getByRole('button', { name: '新建作品', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: '给无人机起名字', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.goto('/part-studio')
    const left = page.getByTestId('sketch-panel-heading'), right = page.getByTestId('preview-panel-heading')
    await expect(left).toBeVisible()
    expect(await left.locator('h2').evaluate(e => getComputedStyle(e).font)).toBe(await right.locator('h2').evaluate(e => getComputedStyle(e).font))
    await expect(page.getByTestId('sketch-toolbar')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
