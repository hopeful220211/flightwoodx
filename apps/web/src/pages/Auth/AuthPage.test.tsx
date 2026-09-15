// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { AuthPage } from './AuthPage'

const { register, enterGuestMode } = vi.hoisted(() => ({ register: vi.fn(), enterGuestMode: vi.fn() }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ register, enterGuestMode }) }))
let container: HTMLDivElement
let root: Root
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  register.mockReset().mockResolvedValue({ success: true })
  enterGuestMode.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={['/register']}><ToastProvider><Routes>
    <Route path="/register" element={<AuthPage />} />
    <Route path="/dashboard" element={<p>工作台</p>} />
  </Routes></ToastProvider></MemoryRouter>))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
async function fill() {
  for (const [id, value] of [['username', 'sample'], ['email', 'sample@example.test'], ['password', 'sample-password']]) {
    const input = container.querySelector<HTMLInputElement>(`#register-${id}`)!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
}
const agreement = () => container.querySelector<HTMLInputElement>('#register-agreement')!
const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!
async function submitEvent() {
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}

it('starts unchecked and blocks even a direct submit event until agreement is selected', async () => {
  await fill()
  expect(agreement()).not.toBeNull()
  expect(agreement().checked).toBe(false)
  expect(agreement().required).toBe(true)
  expect(submit().disabled).toBe(true)
  await submitEvent()
  expect(register).not.toHaveBeenCalled()
  expect(container.textContent).toContain('请先阅读并同意用户使用协议和隐私政策')
})
it('allows registration after agreement and blocks again when unchecked', async () => {
  await fill()
  await act(async () => agreement().click())
  expect(submit().disabled).toBe(false)
  await act(async () => agreement().click())
  expect(submit().disabled).toBe(true)
  await submitEvent()
  expect(register).not.toHaveBeenCalled()
  await act(async () => agreement().click())
  await submitEvent()
  expect(register).toHaveBeenCalledWith('sample', 'sample@example.test', 'sample-password')
  expect(container.textContent).toContain('工作台')
})
it('preserves fields and agreement after an API failure, allowing retry', async () => {
  register.mockResolvedValueOnce({ success: false, message: '注册失败，请重试' })
  await fill()
  await act(async () => agreement().click())
  await submitEvent()
  expect(container.textContent).toContain('注册失败，请重试')
  expect(container.querySelector<HTMLInputElement>('#register-username')!.value).toBe('sample')
  expect(agreement().checked).toBe(true)
  expect(submit().disabled).toBe(false)
  await submitEvent()
  expect(register).toHaveBeenCalledTimes(2)
  expect(container.textContent).toContain('工作台')
})
it('puts independently accessible documents before submit and keeps analytics separate', () => {
  for (const href of ['/terms', '/privacy/policy', '/privacy/children']) {
    const link = container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!
    expect(link).not.toBeNull()
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
  }
  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
  expect(container.textContent).toContain('注册不会开启使用统计')
  expect(Boolean(agreement().compareDocumentPosition(submit()) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
})
it('keeps guest access independent of registration agreement', async () => {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent?.includes('进入游客模式'))!
  await act(async () => button.click())
  expect(enterGuestMode).toHaveBeenCalledOnce()
  expect(register).not.toHaveBeenCalled()
  expect(container.textContent).toContain('工作台')
})
