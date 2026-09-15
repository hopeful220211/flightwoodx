import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { join } from 'node:path'

const groups = ['全部', '最近', '草稿', '装配完成']
const emptyMessage = '暂无作品。新建作品后可以开始设计。'
const sortOptions = ['最近修改', '最早修改', '名称 A–Z']

async function guardLocalNetwork(context: BrowserContext) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (['http:', 'https:'].includes(url.protocol)
      && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
}

function observePage(page: Page) {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })
  page.on('requestfailed', request => {
    // Entering guest mode may cancel obsolete registration-page image requests.
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) {
      failures.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`)
    }
  })
  return failures
}

async function expectSmallRadius(control: Locator) {
  await expect(control).toBeVisible()
  // DJI-aligned app controls retain a small rectangular 6 px radius.
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await expect(control).toHaveCSS(`border-${corner}-radius`, '6px')
  }
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

async function expectEmptyDashboard(page: Page) {
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: '我的作品', level: 1, exact: true })).toBeVisible()
  await expect(page.getByText(emptyMessage, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建作品', exact: true })).toHaveCount(2)
  expect(await page.evaluate(() => {
    const stored = localStorage.getItem('drone_app_design_store')
    return stored ? JSON.parse(stored).state.designs.length : 0
  }), 'Opening and cancelling the dialog must not create a local design').toBe(0)
  await expectNoOverflow(page)
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`dashboard controls match 6px navigation corners and retain guest interactions at ${viewport.width}×${viewport.height}`, async ({ page, context }) => {
    const failures = observePage(page)
    await guardLocalNetwork(context)
    await page.setViewportSize(viewport)

    // Use the real guest entry in a fresh browser context; never borrow a login
    // or register an account merely to check local Dashboard controls.
    await page.goto('/register')
    await page.getByRole('button', { name: '进入游客模式', exact: true }).click()
    await expect(page).toHaveTitle(/FlightWoodX/)
    await expectEmptyDashboard(page)
    expect(await page.evaluate(() => {
      const stored = localStorage.getItem('auth-storage')
      const state = stored ? JSON.parse(stored).state : null
      return state?.user?.isGuest === true && state.token === null && state.isAuthenticated === true
    }), 'The real entry must create a token-free guest session').toBe(true)

    const search = page.getByRole('searchbox', { name: '搜索作品', exact: true })
    const createButtons = page.getByRole('button', { name: '新建作品', exact: true })
    const tablist = page.getByRole('tablist', { name: '作品分组', exact: true })
    const sortButton = page.getByRole('button', { name: /^排序方式：/ })
    await expectSmallRadius(search)
    for (const button of await createButtons.all()) await expectSmallRadius(button)
    await expectSmallRadius(sortButton)
    for (const name of groups) await expectSmallRadius(tablist.getByRole('tab', { name, exact: true }))
    if (viewport.width >= 768) {
      await expectSmallRadius(page.locator('header nav').getByRole('link', { name: '工作台', exact: true }))
    }

    for (const selected of ['最近', '草稿', '装配完成', '全部']) {
      await tablist.getByRole('tab', { name: selected, exact: true }).click()
      for (const name of groups) {
        const tab = tablist.getByRole('tab', { name, exact: true })
        await expect(tab).toHaveAttribute('aria-selected', String(name === selected))
        await expectSmallRadius(tab)
      }
      await expectEmptyDashboard(page)
    }

    // The existing empty-library state stays visible even with an unmatched
    // search; the separate no-match message is reserved for a nonempty library.
    await search.fill('不存在的作品 987654321')
    await expect(search).toHaveValue('不存在的作品 987654321')
    await tablist.getByRole('tab', { name: '草稿', exact: true }).click()
    await expect(tablist.getByRole('tab', { name: '草稿', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expectEmptyDashboard(page)
    await search.clear()
    await tablist.getByRole('tab', { name: '全部', exact: true }).click()
    await expect(search).toHaveValue('')
    await expectEmptyDashboard(page)

    let currentSort = '最近修改'
    for (const nextSort of ['最早修改', '名称 A–Z', '最近修改']) {
      await expect(sortButton).toHaveAccessibleName(`排序方式：${currentSort}`)
      await sortButton.click()
      await expect(sortButton).toHaveAttribute('aria-expanded', 'true')
      const menu = page.getByRole('menu')
      await expectSmallRadius(menu)
      for (const label of sortOptions) {
        await expect(menu.getByRole('menuitemradio', { name: label, exact: true }))
          .toHaveAttribute('aria-checked', String(label === currentSort))
      }
      await menu.getByRole('menuitemradio', { name: nextSort, exact: true }).click()
      currentSort = nextSort
      await expect(sortButton).toHaveAccessibleName(`排序方式：${nextSort}`)
      await expect(sortButton).toContainText(nextSort)
      await expect(sortButton).toHaveAttribute('aria-expanded', 'false')
      await expect(menu).toHaveCount(0)
      await expectSmallRadius(sortButton)
      await expectNoOverflow(page)
    }
    await sortButton.click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(sortButton).toHaveAttribute('aria-expanded', 'false')
    await sortButton.click()
    await page.getByRole('heading', { name: '我的作品', level: 1, exact: true }).click()
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(sortButton).toHaveAttribute('aria-expanded', 'false')

    for (let index = 0; index < 2; index++) {
      await createButtons.nth(index).click()
      const dialog = page.getByRole('dialog', { name: '给无人机起名字', exact: true })
      await expect(dialog).toBeVisible()
      const name = dialog.getByRole('textbox', { name: '无人机名字', exact: true })
      await expect(name).toHaveValue('')
      await name.fill('取消创建回归测试')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expectEmptyDashboard(page)
      await expectSmallRadius(createButtons.nth(index))
    }

    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    if (process.env.FWX_UI_CAPTURE_DIR) {
      await page.screenshot({ path: join(process.env.FWX_UI_CAPTURE_DIR, `dashboard-controls-${viewport.width}.png`), fullPage: true })
    }
    expect(failures).toEqual([])
  })
}
