// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkbenchAnimation } from './WorkbenchAnimation'

const motion = vi.hoisted(() => ({ inView: false, reduced: false }))
vi.mock('framer-motion', () => ({ useInView: () => motion.inView }))
let container: HTMLDivElement
let root: Root
let preference: EventTarget
const video = () => container.querySelector('video')!
const button = () => container.querySelector('button')!
const render = () => act(async () => root.render(<WorkbenchAnimation />))

beforeEach(() => {
  motion.inView = false
  motion.reduced = false
  preference = new EventTarget()
  Object.defineProperty(preference, 'matches', { get: () => motion.reduced })
  vi.stubGlobal('matchMedia', vi.fn(() => preference))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('defers playback until visible, resumes in view and stops on unmount', async () => {
  await render()
  expect(video().play).not.toHaveBeenCalled()
  expect(video().preload).toBe('none')
  motion.inView = true
  await render()
  expect(video().play).toHaveBeenCalledOnce()
  expect(video().muted).toBe(true)
  video().currentTime = 4
  motion.inView = false
  await render()
  expect(video().pause).toHaveBeenCalled()
  motion.inView = true
  await render()
  expect(video().currentTime).toBe(4)
  const pause = vi.mocked(video().pause)
  pause.mockClear()
  await act(async () => root.render(null))
  expect(pause).toHaveBeenCalledOnce()
})

it('plays as a looping image without pause controls and keeps the same frame after scrolling', async () => {
  motion.inView = true
  await render()
  const frame = video().parentElement
  expect(button()).toBeNull()
  expect(video().controls).toBe(false)
  expect(video().loop).toBe(true)
  await act(async () => video().click())
  expect(button()).toBeNull()
  vi.mocked(video().play).mockClear()
  motion.inView = false
  await render()
  motion.inView = true
  await render()
  expect(video().play).toHaveBeenCalledOnce()
  expect(video().parentElement).toBe(frame)
  expect(button()).toBeNull()
})

it('uses a still frame for reduced motion until playback is requested', async () => {
  motion.inView = true
  motion.reduced = true
  await render()
  expect(video().play).not.toHaveBeenCalled()
  await act(async () => button().click())
  expect(video().play).toHaveBeenCalledOnce()
  expect(button()).toBeNull()
})

it('pauses when the tab is hidden and resumes when visible', async () => {
  motion.inView = true
  await render()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(button().getAttribute('aria-label')).toBe('播放演示动画')
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(button()).toBeNull()
})

it('responds to motion preference changes and removes its listener on unmount', async () => {
  motion.inView = true
  const remove = vi.spyOn(preference, 'removeEventListener')
  await render()
  expect(button()).toBeNull()
  motion.reduced = true
  await act(async () => preference.dispatchEvent(new Event('change')))
  expect(button().getAttribute('aria-label')).toBe('播放演示动画')
  motion.reduced = false
  await act(async () => preference.dispatchEvent(new Event('change')))
  expect(button()).toBeNull()
  await act(async () => root.render(null))
  expect(remove).toHaveBeenCalledWith('change', expect.any(Function))
})

it('keeps a poster and retry button after a loading error and reloads the same source', async () => {
  motion.inView = true
  await render()
  await act(async () => video().dispatchEvent(new Event('error')))
  expect(video().hidden).toBe(true)
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/resource/videos/design-workbench-loop.webp')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('演示加载失败')
  expect(button().getAttribute('aria-label')).toBe('重新加载演示动画')
  await act(async () => button().click())
  expect(video().load).toHaveBeenCalledOnce()
  expect(video().hidden).toBe(false)
  expect(button()).toBeNull()
})

it('leaves a manual play button when autoplay is denied', async () => {
  motion.inView = true
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'))
  await render()
  expect(container.querySelector('[role="status"]')).toBeNull()
  expect(button().getAttribute('aria-label')).toBe('播放演示动画')
  await act(async () => button().click())
  expect(button()).toBeNull()
})

it('ignores a stale rejected play request after the animation leaves view', async () => {
  let reject: (reason: Error) => void = () => {}
  motion.inView = true
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise<void>((_, rejectPromise) => { reject = rejectPromise }))
  await render()
  motion.inView = false
  await render()
  await act(async () => reject(new Error('Late media failure')))
  expect(container.querySelector('[role="status"]')).toBeNull()
})
