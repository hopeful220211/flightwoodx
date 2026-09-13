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
  const team = container.querySelector('img[alt="FlightWoodX 团队与木质无人机作品合影"]')
  expect(team?.getAttribute('src')).toBe('/optimized/picture/about/team.webp')
  expect(team?.className).toContain('object-contain')
  expect(container.querySelector('#contact')?.getAttribute('tabindex')).toBe('-1')
  expect(container.querySelector('#contact a[href="tel:+8618393648803"]')?.textContent).toContain('+86 18393648803')
  expect(container.querySelector('#contact')?.textContent).toContain('ccccckd0211')
  expect(container.querySelector('#contact')?.textContent).toContain('如果有合作意向，请联系我们。')
  expect(container.textContent).not.toMatch(/G-Mark|重庆工程大学|世界第一|保证能飞/)
})
