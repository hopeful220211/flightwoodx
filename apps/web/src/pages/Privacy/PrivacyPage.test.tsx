// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, it } from 'vitest'
import { PrivacyPage } from './PrivacyPage'
import { policies } from './policies'

function render(path: string) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/privacy/:document" element={<PrivacyPage />} />
    <Route path="/terms" element={<PrivacyPage documentSlug="terms" />} />
  </Routes></MemoryRouter>)
  return container
}
it('provides public independent links to all notices and settings', () => {
  const page = render('/privacy')
  for (const policy of policies) expect(page.querySelector(`a[href="/privacy/${policy.slug}"]`)).not.toBeNull()
  expect(page.querySelector('a[href="/privacy/settings"]')).not.toBeNull()
})
it('provides a real user agreement, separate from the privacy policy', () => {
  const page = render('/terms')
  expect(page.querySelector('h1')?.textContent).toBe('用户使用协议')
  expect(page.textContent).toContain('芬奇答奥（重庆）科技有限公司')
  expect(page.textContent).toContain('作品权益')
  expect(page.textContent).toContain('不代表同意可选使用统计')
  expect(page.textContent).toContain('2026年9月15日')
})
it.each(policies)('renders the entire $title, a working contents list and contact link', policy => {
  const page = render(`/privacy/${policy.slug}`)
  expect(page.querySelector('h1')?.textContent).toBe(policy.title)
  for (const [index, section] of policy.sections.entries()) {
    expect(page.querySelector(`#section-${index + 1}`)?.textContent).toContain(section.title)
    expect(page.querySelector(`a[href="#section-${index + 1}"]`)).not.toBeNull()
    for (const paragraph of section.paragraphs) expect(page.textContent).toContain(paragraph)
  }
  expect(page.querySelector('a[href="/about#contact"]')).not.toBeNull()
})
it('discloses actual limits instead of claiming a guardian or account deletion workflow exists', () => {
  expect(render('/privacy/children').textContent).toContain('没有在线监护人身份核验或授权流程')
  expect(render('/privacy/rights').textContent).toContain('未提供一键账号注销')
  expect(render('/privacy/cookies').textContent).toContain('90天')
  expect(render('/privacy/data').textContent).toContain('去标识化并不代表完全匿名')
})
it('provides a useful return link for unknown documents', () => {
  const page = render('/privacy/missing')
  expect(page.querySelector('h1')?.textContent).toBe('未找到这份说明')
  expect(page.querySelector('a[href="/privacy"]')).not.toBeNull()
})
