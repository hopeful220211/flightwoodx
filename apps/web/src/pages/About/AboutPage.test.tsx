// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { AboutPage } from './AboutPage'

it('presents the company, intact team photo, awards and contact details on one public page', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><AboutPage /></MemoryRouter>)
  expect(container.querySelector('h1')?.textContent).toBe('关于我们')
  expect([...container.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual(['公司介绍', '我们的团队', '作品获奖', '联系我们'])
  expect(container.textContent).toContain('芬奇答奥（重庆）科技有限公司')
  const aircraft = container.querySelector('img[alt="FlightWoodX 木质无人机"]')
  expect(aircraft?.getAttribute('src')).toBe('/optimized/picture/UI/web_1.webp')
  expect(aircraft?.getAttribute('srcset')).toBe('/optimized/picture/UI/web_1-360.webp 360w, /optimized/picture/UI/web_1-640.webp 640w, /optimized/picture/UI/web_1-720.webp 720w, /optimized/picture/UI/web_1.webp 1396w')
  expect(aircraft?.getAttribute('sizes')).toBe('(max-width: 492px) calc(100vw - 32px), 460px')
  expect(aircraft?.getAttribute('fetchpriority')).toBe('high')
  const team = container.querySelector('img[alt="FlightWoodX 团队与木质无人机作品合影"]')
  expect(team?.getAttribute('src')).toBe('/optimized/picture/about/team.webp')
  expect(team?.getAttribute('srcset')).toBe('/optimized/picture/about/team-384.webp 384w, /optimized/picture/about/team-768.webp 768w, /optimized/picture/about/team-1152.webp 1152w, /optimized/picture/about/team.webp 1440w, /optimized/picture/about/team-1788.webp 1788w')
  expect(team?.getAttribute('sizes')).toBe('(max-width: 767px) calc(100vw - 32px), (max-width: 1248px) calc(100vw - 48px), 1200px')
  expect(team?.getAttribute('loading')).toBe('lazy')
  expect(team?.className).toContain('object-contain')
  expect(container.querySelector('#contact')?.getAttribute('tabindex')).toBe('-1')
  expect(container.querySelector('#contact a[href="tel:+8618393648803"]')?.textContent).toContain('+86 18393648803')
  expect(container.querySelector('#contact')?.textContent).toContain('ccccckd0211')
  expect(container.querySelector('#contact')?.textContent).toContain('如果有合作意向，请联系我们。')
  expect(container.textContent).not.toMatch(/G-Mark|重庆工程大学|世界第一|保证能飞/)
  expect(container.textContent).toContain('线下内容包括木质结构拼装与无人机课程。')
  expect(container.textContent).not.toMatch(/不能替代实机测试|未验证|不代表|需要验证/)
})
