// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))))
afterEach(() => vi.unstubAllGlobals())

it('removes the separate award section and offers a video preview without downloading the video', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><HomePage /></MemoryRouter>)

  expect(container.querySelector('#awards')).toBeNull()
  expect(container.textContent).not.toMatch(/这几个国际设计奖|下面这三个都在手上|其中红点 Best of the Best/)
  const preview = container.querySelector('button[aria-label="播放视频"]')
  expect(preview).not.toBeNull()
  expect(preview?.querySelector('img')?.getAttribute('src')).toBe('/optimized/picture/video/flightwoodx-introduction.webp')
  expect(container.querySelector('video')).toBeNull()
  expect(container.querySelector('a[href="#awards"], button[aria-label="查看获奖荣誉"]')).toBeNull()
  expect(container.textContent).toContain('不只是又一个 STEAM 玩具')
})

it('replaces the hero text capsule with the four owner-provided honor images', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><HomePage /></MemoryRouter>)

  const honors = container.querySelector('[role="group"][aria-label="获奖荣誉"]')
  expect(honors).not.toBeNull()
  expect(Array.from(honors!.querySelectorAll('img'), image => ({
    src: image.getAttribute('src'), alt: image.alt, width: image.width, height: image.height,
  }))).toEqual([
    { src: '/optimized/picture/honors/red-dot.webp', alt: 'Red Dot 获奖荣誉', width: 2298, height: 872 },
    { src: '/optimized/picture/honors/if-design.webp', alt: 'iF Design Award 获奖荣誉', width: 2298, height: 872 },
    { src: '/optimized/picture/honors/idea.webp', alt: 'IDEA 获奖荣誉', width: 2298, height: 872 },
    { src: '/optimized/picture/honors/other-awards.webp', alt: '鲲鹏奖、红棉设计奖、东莞杯、IDA、New Star Award 荣誉', width: 2298, height: 872 },
  ])
  expect(honors?.textContent).toBe('')
  expect(container.textContent).not.toContain('Red Dot 2024 · iF 2026 · IDEA')
  expect(container.textContent).toContain('3 项全球设计大奖')
  expect(container.textContent).not.toMatch(/g-?mark|10\+/i)
})
