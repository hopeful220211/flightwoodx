// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, statSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { SectionHeading } from './components/SectionHeading'
import { Button } from '../../components/common/Button'
import { WhyUsSection } from './sections/WhyUsSection'

it('uses the supplied neutral-toned flight testing photo', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  try {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(<WhyUsSection />)
    expect(host.querySelector('img[alt="飞行测试"]')?.getAttribute('src')).toBe('/resource/picture/flight-testing-neutral.webp')
  } finally {
    vi.unstubAllGlobals()
  }
})

it('loads Open Sans and removes the old site-wide Chinese display face', () => {
  const css = readFileSync('src/index.css', 'utf8')
  expect(css).toContain("font-family: 'Open Sans'")
  expect(css).toContain("/fonts/open-sans-variable.woff2")
  expect(css).not.toContain("/fonts/open-sans-variable.ttf")
  expect(statSync('public/fonts/open-sans-variable.woff2').size)
    .toBeLessThan(statSync('public/fonts/open-sans-variable.ttf').size)
  expect(css).not.toContain('@import \'misans')
  expect(css).not.toContain("font-family: 'DingTalk JinBuTi'")
  expect(css).toContain("font-family: 'Montserrat'")
})

it('uses a single reference-based title treatment without the old decorative mark', () => {
  const html = renderToStaticMarkup(<SectionHeading eyebrow="功能介绍" title="平台功能" lead="绘制零件、拼装机体，并用积木程序进行模拟测试。" />)
  const host = document.createElement('div'); host.innerHTML = html
  expect(host.querySelector('h2')?.classList.contains('site-section-title')).toBe(true)
  expect(host.querySelector('p')?.classList.contains('site-section-lead')).toBe(true)
  expect(host.querySelector('[aria-hidden="true"]')).toBeNull()
  expect(host.textContent).toContain('绘制零件、拼装机体，并用积木程序进行模拟测试。')
})

it('gives shared actions explicit style hooks without changing their behavior', () => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<Button variant="outline" disabled>保存</Button>)
  const button = host.querySelector('button')!
  expect(button.classList.contains('site-button')).toBe(true)
  expect(button.dataset.variant).toBe('outline')
  expect(button.disabled).toBe(true)
  expect(button.textContent).toBe('保存')
})
