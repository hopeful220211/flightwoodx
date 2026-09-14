// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { CommunityPostPage } from './CommunityPostPage'

const mocks = vi.hoisted(() => ({ track: vi.fn(), copy: vi.fn(), toast: { push: vi.fn() } }))
vi.mock('../../features/analytics/client', () => ({ trackEvent: mocks.track }))
vi.mock('../../components/common/Toast', () => ({ useToast: () => mocks.toast }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ token: null, user: null }) }))
vi.mock('../../hooks/useCommunity', () => ({ useCommunityPost: () => ({ data: { id: 'post-a', title: 'Private title', likeCount: 0, favoriteCount: 0 }, isLoading: false, isError: false }), useToggleLike: () => ({ mutate: vi.fn() }) }))
vi.mock('../../components/features/community/CommunityShell', () => ({ CommunityShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('../../components/features/community/CommentSection', () => ({ CommentSection: () => null }))
vi.mock('../../components/features/community/SaveToCollectionButton', () => ({ SaveToCollectionButton: () => null }))
vi.mock('../../components/features/community/ReuseButton', () => ({ ReuseButton: () => null }))
vi.mock('../../components/design/AssembledDrone', () => ({ AssembledDrone: () => null }))
let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } })
  mocks.track.mockClear(); mocks.copy.mockReset()
  container = document.createElement('div'); root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={['/community/post-a']}><Routes><Route path="/community/:postId" element={<CommunityPostPage />} /></Routes></MemoryRouter>))
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })
it('counts successful clipboard writes, not share clicks or pending writes', async () => {
  let finish!: () => void
  mocks.copy.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="复制链接分享"]')!.click())
  expect(mocks.track).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(mocks.track).toHaveBeenCalledExactlyOnceWith('community_link_copied', { postId: 'post-a' })
})
it('does not claim sharing or copying when clipboard permission is refused', async () => {
  mocks.copy.mockRejectedValue(new Error('Permission denied'))
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="复制链接分享"]')!.click())
  expect(mocks.track).not.toHaveBeenCalled()
})
