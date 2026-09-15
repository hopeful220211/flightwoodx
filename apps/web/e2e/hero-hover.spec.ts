import { expect, test } from '@playwright/test'

for (const width of [390,768,1440]) test(`hero hover keeps depth and layout at ${width}`, async ({page}, info) => {
  await page.setViewportSize({width,height:width === 768 ? 1024 : width === 390 ? 844 : 900})
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.goto('/')
  const stage = page.locator('.home-drone-stage')
  await stage.scrollIntoViewIfNeeded()
  const images = stage.locator('img')
  await expect(images).toHaveCount(3)
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(n => (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth > 0))).toBe(true)
  const running = () => images.evaluateAll(nodes => nodes.map(n => ({name:getComputedStyle(n).animationName,duration:getComputedStyle(n).animationDuration,state:getComputedStyle(n).animationPlayState,transform:getComputedStyle(n).transform})))
  await expect.poll(async () => (await running()).every(a => a.name === 'home-drone-hover' && a.state === 'running')).toBe(true)
  const before = await running()
  expect(new Set(before.map(a => a.duration)).size).toBe(3)
  await expect.poll(async () => (await running()).every((a,i) => a.transform !== before[i]!.transform)).toBe(true)
  const positions = await images.evaluateAll(nodes => nodes.map(n => {
    const a = n.getAnimations()[0]!, duration = Number(a.effect!.getTiming().duration)
    a.pause(); a.currentTime = duration * .25
    const rect = n.getBoundingClientRect(); return {left:rect.left,right:rect.right}
  }))
  expect(positions.every(p => p.left >= -1 && p.right <= width+1)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath(`hover-${width}.png`)})
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect.poll(async () => (await running()).every(a => a.name === 'none')).toBe(true)
  await expect(page.getByRole('button',{name:'开始设计',exact:true})).toBeVisible()
})
