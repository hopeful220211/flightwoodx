// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VideoPreviewSection, type VideoPreviewHandle } from './VideoPreviewSection'

let container: HTMLDivElement
let root: Root
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  // jsdom has no media engine or layout scrolling. These shims expose requests;
  // actual playback, native controls and stable layout are browser E2E checks.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  vi.unstubAllGlobals()
})

it('initially renders only the original cover in a stable video frame', async () => {
  await act(async () => root.render(<VideoPreviewSection />))
  expect(container.querySelector('[data-testid="home-video-frame"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="播放视频"]')).not.toBeNull()
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/optimized/picture/video/flightwoodx-introduction.webp')
  expect(container.querySelector('video')).toBeNull()
  expect(container.querySelector('dialog')).toBeNull()
})

it('replaces the cover in place with a focused native inline player without scrolling', async () => {
  await act(async () => root.render(<VideoPreviewSection />))
  const frame = container.querySelector('[data-testid="home-video-frame"]')
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  const video = container.querySelector('video')!
  expect(video).not.toBeNull()
  expect(video.parentElement).toBe(frame)
  expect(container.querySelector('[data-testid="home-video-frame"]')).toBe(frame)
  expect(video.getAttribute('src')).toBe('/resource/videos/flightwoodx-introduction.mp4')
  expect(video.getAttribute('aria-label')).toBe('FlightWoodX 产品演示')
  expect(video.controls).toBe(true)
  expect(video.autoplay).toBe(true)
  expect(video.playsInline).toBe(true)
  expect(video.preload).toBe('none')
  expect(video.tabIndex).toBe(0)
  expect(document.activeElement).toBe(video)
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
  expect(container.querySelector('button[aria-label="播放视频"]')).toBeNull()
  expect(container.querySelector('dialog')).toBeNull()
})

it('the hero play handle starts the same inline player and scrolls its frame into view', async () => {
  const handle = createRef<VideoPreviewHandle>()
  await act(async () => root.render(<VideoPreviewSection ref={handle} />))
  expect(handle.current).not.toBeNull()
  await act(async () => handle.current!.play())
  const video = container.querySelector('video')!
  expect(video).not.toBeNull()
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  expect(document.activeElement).toBe(video)
})

it('uses immediate scrolling when reduced motion is requested', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const handle = createRef<VideoPreviewHandle>()
  await act(async () => root.render(<VideoPreviewSection ref={handle} />))
  expect(handle.current).not.toBeNull()
  await act(async () => handle.current!.play())
  expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
})

it('resumes the existing player from its current time instead of recreating or restarting it', async () => {
  const handle = createRef<VideoPreviewHandle>()
  await act(async () => root.render(<VideoPreviewSection ref={handle} />))
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  const video = container.querySelector('video')!
  expect(video).not.toBeNull()
  video.currentTime = 42
  video.pause()
  const play = vi.spyOn(video, 'play')
  await act(async () => handle.current!.play())
  expect(container.querySelector('video')).toBe(video)
  expect(video.currentTime).toBe(42)
  expect(play).toHaveBeenCalledOnce()
})

it('keeps playback untouched during parent rerenders and pauses on unmount', async () => {
  await act(async () => root.render(<VideoPreviewSection />))
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  const video = container.querySelector('video')!
  expect(video).not.toBeNull()
  const pause = vi.spyOn(video, 'pause')
  await act(async () => root.render(<VideoPreviewSection />))
  expect(pause).not.toHaveBeenCalled()
  await act(async () => root.render(null))
  expect(pause).toHaveBeenCalledOnce()
})

it('shows a retry overlay and replaces the failed player without replacing its frame', async () => {
  await act(async () => root.render(<VideoPreviewSection />))
  const frame = container.querySelector('[data-testid="home-video-frame"]')
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  const video = container.querySelector('video')!
  expect(video).not.toBeNull()
  await act(async () => video.dispatchEvent(new Event('error')))
  const alert = container.querySelector('[role="alert"]')!
  expect(alert).not.toBeNull()
  expect(alert.textContent).toContain('视频加载失败')
  await act(async () => Array.from(alert.querySelectorAll('button')).find(button => button.textContent === '重试')!.click())
  expect(container.querySelector('[data-testid="home-video-frame"]')).toBe(frame)
  const retried = container.querySelector('video')!
  expect(retried).not.toBe(video)
  expect(retried.getAttribute('src')).toBe(video.getAttribute('src'))
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(video.pause).toHaveBeenCalled()
  expect(document.activeElement).toBe(retried)
})

it('reports a rejected resume request instead of silently ignoring it', async () => {
  const handle = createRef<VideoPreviewHandle>()
  await act(async () => root.render(<VideoPreviewSection ref={handle} />))
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  const video = container.querySelector('video')!
  expect(video).not.toBeNull()
  vi.spyOn(video, 'play').mockRejectedValue(new DOMException('Playback failed', 'NotSupportedError'))
  await act(async () => handle.current!.play())
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
})

it('removes the failed player from interaction and moves its current focus to retry', async () => {
  await act(async () => root.render(<VideoPreviewSection />))
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  const video = container.querySelector('video')!
  expect(document.activeElement).toBe(video)
  await act(async () => video.dispatchEvent(new Event('error')))
  expect(video.hidden).toBe(true)
  expect(video.controls).toBe(false)
  expect(video.tabIndex).toBe(-1)
  const retry = container.querySelector<HTMLButtonElement>('[role="alert"] button')!
  expect(document.activeElement).toBe(retry)
  await act(async () => retry.click())
  const recoveredVideo = container.querySelector('video')!
  expect(recoveredVideo.hidden).toBe(false)
  expect(recoveredVideo.controls).toBe(true)
  expect(recoveredVideo.tabIndex).toBe(0)
})

it('preserves focus outside the playback frame when a delayed media error occurs', async () => {
  await act(async () => root.render(<><VideoPreviewSection /><button>下一栏</button></>))
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  const outside = Array.from(container.querySelectorAll('button')).find(button => button.textContent === '下一栏')!
  outside.focus()
  await act(async () => container.querySelector('video')!.dispatchEvent(new Event('error')))
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  expect(document.activeElement).toBe(outside)
})

it('preserves outside focus when an earlier resume promise fails later', async () => {
  const handle = createRef<VideoPreviewHandle>()
  await act(async () => root.render(<><VideoPreviewSection ref={handle} /><button>下一栏</button></>))
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="播放视频"]')!.click())
  let rejectPlayback: (error: Error) => void = () => {}
  vi.spyOn(container.querySelector('video')!, 'play').mockReturnValue(new Promise<void>((_, reject) => { rejectPlayback = reject }))
  await act(async () => handle.current!.play())
  const outside = Array.from(container.querySelectorAll('button')).find(button => button.textContent === '下一栏')!
  outside.focus()
  await act(async () => rejectPlayback(new DOMException('Playback failed', 'NotSupportedError')))
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  expect(document.activeElement).toBe(outside)
})
