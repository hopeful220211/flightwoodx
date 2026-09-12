// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VideoModal } from './VideoModal'

let container: HTMLDivElement
let opener: HTMLButtonElement
let root: Root
const dialogMethods = ['showModal', 'close'] as const
const originalDialogMethods = dialogMethods.map(method => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  opener = document.createElement('button')
  document.body.append(opener, container)
  root = createRoot(container)
  // jsdom has no dialog top layer or media engine. Browser E2E covers native
  // focus trapping and actual playback; these shims only expose lifecycle calls.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false }) },
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  opener.remove()
  document.body.style.overflow = ''
  vi.restoreAllMocks()
  dialogMethods.forEach((method, index) => {
    const descriptor = originalDialogMethods[index]
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, method, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method)
  })
  vi.unstubAllGlobals()
})

it('does not create or preload a player while closed', async () => {
  await act(async () => root.render(<VideoModal open={false} onClose={() => {}} videoUrl="/demo.mp4" />))
  expect(document.querySelector('video')).toBeNull()
  expect(document.querySelector('dialog')).toBeNull()
})

it('opens a named native modal with inline, on-demand native video controls', async () => {
  await act(async () => root.render(<VideoModal open onClose={() => {}} videoUrl="/demo.mp4" title="FlightWoodX 产品演示" />))
  const dialog = document.querySelector('dialog')!
  expect(dialog).not.toBeNull()
  expect(dialog.open).toBe(true)
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('FlightWoodX 产品演示')
  const video = dialog.querySelector('video')!
  expect(video.getAttribute('src')).toBe('/demo.mp4')
  expect(video.controls).toBe(true)
  expect(video.autoplay).toBe(true)
  expect(video.playsInline).toBe(true)
  expect(video.preload).toBe('none')
  expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭')
})

it('pauses the actual player and restores focus and scrolling when closed by its parent', async () => {
  opener.focus()
  document.body.style.overflow = 'auto'
  await act(async () => root.render(<VideoModal open onClose={() => {}} videoUrl="/demo.mp4" />))
  const video = document.querySelector('video')!
  const pause = vi.spyOn(video, 'pause')
  expect(document.body.style.overflow).toBe('hidden')
  await act(async () => root.render(<VideoModal open={false} onClose={() => {}} videoUrl="/demo.mp4" />))
  expect(pause).toHaveBeenCalled()
  expect(document.querySelector('video')).toBeNull()
  expect(document.activeElement).toBe(opener)
  expect(document.body.style.overflow).toBe('auto')
})

it('keeps focus stable on rerender and native Escape cancellation uses the latest close handler', async () => {
  const previousClose = vi.fn()
  const nextClose = vi.fn()
  await act(async () => root.render(<VideoModal open onClose={previousClose} videoUrl="/demo.mp4" />))
  const video = document.querySelector('video')!
  video.tabIndex = 0
  video.focus()
  await act(async () => root.render(<VideoModal open onClose={nextClose} videoUrl="/demo.mp4" />))
  expect(document.activeElement).toBe(video)
  const dialog = document.querySelector('dialog')!
  expect(dialog).not.toBeNull()
  const cancel = new Event('cancel', { cancelable: true })
  await act(async () => dialog.dispatchEvent(cancel))
  expect(cancel.defaultPrevented).toBe(true)
  expect(nextClose).toHaveBeenCalledOnce()
  expect(previousClose).not.toHaveBeenCalled()
  expect(video.pause).toHaveBeenCalled()
})

it('closes from the close button, not from clicking the video', async () => {
  const onClose = vi.fn()
  await act(async () => root.render(<VideoModal open onClose={onClose} videoUrl="/demo.mp4" />))
  const video = document.querySelector('video')!
  await act(async () => video.click())
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click())
  expect(onClose).toHaveBeenCalledOnce()
  expect(video.pause).toHaveBeenCalled()
})

it('only closes dialog-targeted clicks outside its content rectangle', async () => {
  const onClose = vi.fn()
  await act(async () => root.render(<VideoModal open onClose={onClose} videoUrl="/demo.mp4" />))
  const dialog = document.querySelector('dialog')!
  expect(dialog).not.toBeNull()
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 640, 480))
  await act(async () => dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 200 })))
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 })))
  expect(onClose).toHaveBeenCalledOnce()
})

it('shows an explicit playback error and retries with a fresh player', async () => {
  await act(async () => root.render(<VideoModal open onClose={() => {}} videoUrl="/demo.mp4" />))
  const failedVideo = document.querySelector('video')!
  const failedPause = vi.spyOn(failedVideo, 'pause')
  await act(async () => failedVideo.dispatchEvent(new Event('error')))
  const alert = document.querySelector('[role="alert"]')!
  expect(alert).not.toBeNull()
  expect(alert.textContent).toContain('视频加载失败')
  const retry = Array.from(document.querySelectorAll('button')).find(button => button.textContent === '重试')!
  await act(async () => retry.click())
  const retriedVideo = document.querySelector('video')!
  expect(retriedVideo).not.toBe(failedVideo)
  expect(retriedVideo.getAttribute('src')).toBe('/demo.mp4')
  expect(document.querySelector('[role="alert"]')).toBeNull()
  expect(failedPause).toHaveBeenCalled()
  const retriedPause = vi.spyOn(retriedVideo, 'pause')
  await act(async () => root.render(<VideoModal open={false} onClose={() => {}} videoUrl="/demo.mp4" />))
  expect(retriedPause).toHaveBeenCalled()
})
