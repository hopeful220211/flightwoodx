// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { Footer } from './Footer'

function renderFooter() {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><Footer /></MemoryRouter>)
  return container
}

it('opens company information and both contact entries on the shared about page', () => {
  const container = renderFooter()
  const links = [...container.querySelectorAll('a')]
  for (const [label, href] of [['关于我们', '/about'], ['联系我们', '/about#contact'], ['合作入口', '/about#contact']]) {
    expect(links.find(link => link.textContent === label)?.getAttribute('href')).toBe(href)
  }
  expect(container.textContent).not.toMatch(/加入我们|关于我们（未开放）|联系我们（未开放）/)
})

it('shows the organizer and the website-specific ICP and police records', () => {
  const container = renderFooter()
  expect(container.querySelector('footer')?.getAttribute('role')).toBe('contentinfo')
  expect(container.textContent).toContain('芬奇答奥（重庆）科技有限公司')
  expect(container.textContent).toContain('渝ICP备2026006667号-2')
  expect(container.textContent).toContain('渝公网安备50010502504712号')
  expect(container.textContent).not.toMatch(/待备案|渝ICP备2026006667号-1/)
})

it('links both filing numbers to their official queries in safe new tabs', () => {
  const links = Array.from(renderFooter().querySelectorAll('a[target="_blank"]'))
  expect(links.map(link => ({ text: link.textContent, href: link.getAttribute('href') }))).toEqual([
    { text: '渝ICP备2026006667号-2', href: 'https://beian.miit.gov.cn/' },
    { text: '渝公网安备50010502504712号', href: 'https://beian.mps.gov.cn/#/query/webSearch?code=50010502504712' },
  ])
  for (const link of links) {
    expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
  }
})

it('keeps a local, fixed-size official badge inside the police filing link', () => {
  const image = renderFooter().querySelector<HTMLImageElement>('a[href*="beian.mps.gov.cn"] img')
  expect(image).not.toBeNull()
  expect(image?.getAttribute('src')).toBe('/filing/public-security.png')
  expect(image?.alt).toBe('公安备案图标')
  expect(image?.width).toBe(20)
  expect(image?.height).toBe(20)
})
