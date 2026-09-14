// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ContactSection } from './ContactSection'

const tracked = vi.hoisted(() => vi.fn())
vi.mock('../../features/analytics/client', () => ({ trackEvent: tracked }))

let container: HTMLDivElement
let root: Root
const writeText = vi.fn<() => Promise<void>>()
const button = () => container.querySelector('button')!
const status = () => container.querySelector('[role="status"]')!

beforeEach(async () => {
  tracked.mockClear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  writeText.mockReset().mockResolvedValue()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<ContactSection />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('copies the exact WeChat ID and reports confirmed completion', async () => {
  expect(status().textContent).toBe('')
  await act(async () => button().click())
  expect(writeText).toHaveBeenCalledExactlyOnceWith('ccccckd0211')
  expect(status().textContent).toBe('已复制微信号')
  expect(button().disabled).toBe(false)
  expect(tracked).toHaveBeenCalledExactlyOnceWith('contact_action', { action: 'wechat_copied' })
})

it('preserves the contact details after a clipboard refusal and allows retry', async () => {
  writeText.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
  await act(async () => button().click())
  expect(status().textContent).toBe('复制失败，请长按或选中微信号复制。')
  expect(container.textContent).toContain('ccccckd0211')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('tel:+8618393648803')
  expect(button().disabled).toBe(false)
  expect(tracked).not.toHaveBeenCalled()
  await act(async () => button().click())
  expect(status().textContent).toBe('已复制微信号')
})

it('explains manual copying when the clipboard API is unavailable', async () => {
  vi.stubGlobal('navigator', {})
  await act(async () => button().click())
  expect(status().textContent).toBe('复制失败，请长按或选中微信号复制。')
  expect(button().disabled).toBe(false)
})

it('does not claim success while pending or submit duplicate copies', async () => {
  let resolveCopy = () => {}
  writeText.mockReturnValueOnce(new Promise<void>(resolve => { resolveCopy = resolve }))
  await act(async () => { button().click(); button().click() })
  expect(button().disabled).toBe(true)
  expect(status().textContent).toBe('')
  expect(writeText).toHaveBeenCalledOnce()
  expect(tracked).not.toHaveBeenCalled()
  await act(async () => resolveCopy())
  expect(status().textContent).toBe('已复制微信号')
  expect(button().disabled).toBe(false)
})

it('handles a pending copy that rejects after leaving the page', async () => {
  let rejectCopy = (_reason: Error) => {}
  writeText.mockReturnValueOnce(new Promise<void>((_, reject) => { rejectCopy = reject }))
  await act(async () => button().click())
  await act(async () => root.render(null))
  await act(async () => rejectCopy(new Error('Late failure')))
  expect(container.textContent).toBe('')
})
