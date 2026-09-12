// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AwardsSection } from './AwardsSection'
import { HeroSection } from './HeroSection'

beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))))
afterEach(() => vi.unstubAllGlobals())

it('shows only the three awards confirmed by the owner', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<AwardsSection />)

  expect(Array.from(container.querySelectorAll('h3'), node => node.textContent))
    .toEqual(['Red Dot', 'iF Design', 'IDEA'])
  expect(Array.from(container.querySelectorAll('img'), node => node.alt))
    .toEqual(['Red Dot', 'iF Design', 'IDEA'])
  expect(container.textContent).toContain('红点、iF、IDEA，下面这三个都在手上。')
  expect(container.innerHTML).not.toMatch(/g-?mark|四个/i)
})

it('replaces the hero text capsule with the four owner-provided honor images', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><HeroSection /></MemoryRouter>)

  const honors = container.querySelector('button[aria-label="查看获奖荣誉"]')
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
