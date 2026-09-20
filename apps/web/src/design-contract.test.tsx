// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Input } from './components/common/Input'
import { Select } from './components/common/Select'
import { PageHeader } from './components/common/PageHeader'

it('shares form and heading contracts without changing labels, values or disabled state', () => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<><Input label="邮箱" defaultValue="test@example.test" disabled /><Select label="角色" options={[{ value: 'student', label: '学生' }]} /><PageHeader title="我的作品" description="作品说明" /></>)
  expect(host.querySelector('input')?.classList.contains('site-form-control')).toBe(true)
  expect(host.querySelector('select')?.classList.contains('site-form-control')).toBe(true)
  expect(host.querySelector('input')?.value).toBe('test@example.test')
  expect(host.querySelector('input')?.disabled).toBe(true)
  expect(host.querySelector('h1')?.classList.contains('site-page-title')).toBe(true)
  expect(host.textContent).toContain('我的作品作品说明')
})

it('keeps the brand palette and adds a documented shared detail layer', () => {
  const css = readFileSync('src/design-system.css', 'utf8')
  expect(css).toContain('--site-control-height: 44px')
  expect(css).toContain('.site-form-control')
  expect(css).toContain('.admin-shell')
  expect(css).toContain('.privacy-page')
  expect(css).toContain('.site-page-title')
})
