// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { apiFetch } from '../../utils/api'
import { CommunityPage } from './CommunityPage'
import { FollowingFeedPage } from '../Feed/FollowingFeedPage'
import { LeaderboardPage } from '../Leaderboard/LeaderboardPage'
import type { PostCard } from '../../hooks/useCommunityFeed'

const feed = vi.hoisted(() => ({ items: [] as PostCard[] }))
vi.mock('../../hooks/useCommunityFeed', () => ({ useCommunityFeed: () => ({
  data: { pages: [{ items: feed.items, total: feed.items.length }] }, isLoading: false, isError: false,
  hasNextPage: false, isFetchingNextPage: false,
}) }))
vi.mock('../../hooks/useFollow', async importOriginal => ({
  ...await importOriginal<object>(),
  useFollowingFeed: () => ({ data: { pages: [{ items: [] }] }, isLoading: false, isError: false, hasNextPage: false }),
}))
vi.mock('../../utils/api', async importOriginal => ({
  ...await importOriginal<object>(), apiFetch: vi.fn(),
}))
let root: Root
let container: HTMLDivElement
let queryClient: QueryClient
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  feed.items = []
  vi.mocked(apiFetch).mockReset()
  localStorage.clear()
  useAuthStore.setState({ user: { id: 'copy-user', username: '学生', role: 'student' }, token: 'test-token', isAuthenticated: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  container.remove()
  vi.unstubAllGlobals()
})
async function render(page: React.ReactNode) {
  await act(async () => root.render(<MemoryRouter><QueryClientProvider client={queryClient}><ToastProvider>{page}</ToastProvider></QueryClientProvider></MemoryRouter>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
}

it('explains community actions and the author permission required for copying', async () => {
  await render(<CommunityPage />)
  expect(container.textContent).toContain('浏览用户公开发布的无人机设计。')
  expect(container.textContent).toContain('复制作者允许复用的设计并继续编辑')
  expect(container.textContent).toContain('社区暂无公开作品。')
  expect(container.textContent).not.toContain('小创客们')
})

it('preserves user-written titles while rewriting platform descriptions', async () => {
  feed.items = [{ id: 'post-1', authorId: 'user-1', projectId: 'project-1', title: '我的飞行之旅，作品本身在说话啦', author: { id: 'user-1', username: '原作者' }, likeCount: 4, favoriteCount: 2, likedByMe: false, createdAt: '2026-09-13T00:00:00Z' }]
  await render(<CommunityPage />)
  expect(container.textContent).toContain(feed.items[0].title)
  expect(container.textContent).toContain('原作者')
  expect(container.textContent).toContain('复制作者允许复用的设计并继续编辑')
})

it('does not equate an empty following feed with not following anyone', async () => {
  await render(<FollowingFeedPage />)
  expect(container.textContent).toContain('暂无关注作者的公开作品')
  expect(container.textContent).not.toContain('还没有关注任何创作者')
})

it('labels like rankings as positions rather than awards', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ success: true, data: { items: [
    { id: 'post-1', title: '作品一', author: null, likeCount: 9 },
    { id: 'post-2', title: '作品二', author: null, likeCount: 8 },
    { id: 'post-3', title: '作品三', author: null, likeCount: 7 },
  ], total: 3 } })
  await render(<LeaderboardPage />)
  expect(container.textContent).toContain('按总点赞数展示社区公开作品，最多显示 30 件。')
  for (const rank of [1, 2, 3]) expect(container.textContent).toContain(`第 ${rank} 名`)
  expect(container.textContent).not.toMatch(/冠军|亚军|季军/)
})
