// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { useDesignStore } from '../../stores/designStore'
import { DashboardPage } from './DashboardPage'

let container: HTMLDivElement
let root: Root
let queryClient: QueryClient

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  useDesignStore.getState().clearAll()
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(
    <MemoryRouter><QueryClientProvider client={queryClient}><ToastProvider><DashboardPage /></ToastProvider></QueryClientProvider></MemoryRouter>,
  ))
})

afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  container.remove()
  vi.unstubAllGlobals()
})

function expectSmallCorners(element: Element) {
  expect(element.classList.contains('rounded-lg')).toBe(true)
  expect(element.className).not.toMatch(/rounded-(pill|full)/)
}

it('uses small rectangular corners on search, both create buttons and every filter state', async () => {
  expectSmallCorners(container.querySelector('input[type="search"]')!)
  const createButtons = [...container.querySelectorAll('button')].filter(button => button.textContent?.trim() === '新建作品')
  expect(createButtons).toHaveLength(2)
  createButtons.forEach(expectSmallCorners)
  const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  expect(tabs.map(tab => tab.textContent)).toEqual(['全部', '最近', '草稿', '装配完成'])
  for (const tab of tabs) {
    await act(async () => tab.click())
    expect(tab.getAttribute('aria-selected')).toBe('true')
    tabs.forEach(expectSmallCorners)
  }
})

it('keeps small sorting corners and preserves choosing a sort option', async () => {
  const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!
  expectSmallCorners(trigger)
  await act(async () => trigger.click())
  expectSmallCorners(container.querySelector('[role="menu"]')!)
  const oldest = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(option => option.textContent === '最早修改')!
  await act(async () => oldest.click())
  expect(trigger.getAttribute('aria-label')).toBe('排序方式：最早修改')
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('[role="menu"]')).toBeNull()
})
