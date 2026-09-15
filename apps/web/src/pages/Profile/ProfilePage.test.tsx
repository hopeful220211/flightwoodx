// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { useProfileStore } from '../../stores/profileStore'
import { useDesignStore } from '../../stores/designStore'
import { ProfilePage } from './ProfilePage'

const api = vi.hoisted(() => ({ getMe: vi.fn(), updateProfile: vi.fn(), deleteDroneDesignByLocal: vi.fn() }))
vi.mock('../../utils/api', async importOriginal => ({ ...await importOriginal<object>(), ...api }))
let container: HTMLDivElement
let root: Root
const alice = { id: 'account-a', username: 'Alice', role: 'student' as const, profile: { displayName: 'Alice', school: 'Alice school' } }
const bob = { id: 'account-b', username: 'Bob', role: 'student' as const, profile: { displayName: 'Bob', school: 'Bob school' } }
function button(text: string) { return [...container.querySelectorAll('button')].find(item => item.textContent === text)! }
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  api.getMe.mockReset().mockResolvedValue({ success: true, data: alice })
  api.updateProfile.mockReset()
  localStorage.clear()
  useDesignStore.getState().clearAll()
  useAuthStore.setState({ user: alice, token: 'token-a', isAuthenticated: true })
  useProfileStore.getState().update({ nickname: 'Alice', school: 'Alice school' })
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter><ToastProvider><ProfilePage /></ToastProvider></MemoryRouter>))
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })

it('does not overwrite the next account with a previous profile save response', async () => {
  let finish!: (value: unknown) => void
  api.updateProfile.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await act(async () => button('编辑').click())
  await act(async () => button('保存').click())
  api.getMe.mockResolvedValue({ success: true, data: bob })
  await act(async () => {
    useAuthStore.setState({ user: bob, token: 'token-b', isAuthenticated: true })
    useProfileStore.getState().update({ nickname: 'Bob', school: 'Bob school' })
  })
  await act(async () => finish({ success: true, data: alice }))
  expect(useAuthStore.getState().user?.id).toBe('account-b')
  expect(useProfileStore.getState().profile.nickname).toBe('Bob')
  expect(container.querySelector('input')).toBeNull()
})

it('keeps an editable profile and its values after the service rejects a save', async () => {
  api.updateProfile.mockResolvedValue({ success: false, error: '暂时无法保存' })
  await act(async () => button('编辑').click())
  await act(async () => button('保存').click())
  expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('Alice')
  expect(button('保存')).toBeDefined()
  expect(container.textContent).toContain('暂时无法保存')
  expect(useProfileStore.getState().profile.school).toBe('Alice school')
})

it('creates a separate draft instead of reopening the active work', async () => {
  let oldId!: string
  await act(async () => {
    oldId = useDesignStore.getState().createDesign('Existing work')
    useDesignStore.getState().setActiveDesignId(oldId)
  })
  await act(async () => button('新建设计').click())
  expect(useDesignStore.getState().designs).toHaveLength(1)
  await act(async () => document.querySelector<HTMLInputElement>('input[value="free"]')!.click())
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === '开始搭建')!.click())
  expect(useDesignStore.getState().designs).toHaveLength(2)
  expect(useDesignStore.getState().activeDesignId).not.toBe(oldId)
})

it('identifies learning totals as local records rather than account-wide progress', () => {
  expect(container.textContent).toContain('本机学习记录')
  expect(container.textContent).toContain('这些记录仅保存在当前浏览器，不与账号同步。')
})

it('allows long profile text to wrap without truncating the saved name or shrinking controls', async () => {
  const nickname = 'copy_0123456789'
  const school = 'SchoolNameWithoutSpacesForProfileLayout'
  await act(async () => useProfileStore.getState().update({ nickname, school, grade: '七年级' }))
  const card = container.querySelector('.group')!
  const heading = card.querySelector('h2')!
  const text = heading.parentElement!
  const schoolText = text.querySelector('p')!
  expect(heading.textContent).toBe(nickname)
  expect(schoolText.textContent).toBe(`${school} · 七年级`)
  expect(heading.classList.contains('break-words')).toBe(true)
  expect(schoolText.classList.contains('break-words')).toBe(true)
  expect(text.classList.contains('min-w-0')).toBe(true)
  expect(card.querySelector('.items-start > .flex-1')?.classList.contains('min-w-0')).toBe(true)
  expect(text.previousElementSibling?.classList.contains('shrink-0')).toBe(true)
  expect(button('编辑').classList.contains('shrink-0')).toBe(true)
  expect(card.querySelector('.truncate, .overflow-hidden')).toBeNull()
})
