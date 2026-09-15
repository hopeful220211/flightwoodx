import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Search, ImageOff, Loader2, Trophy } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { useCommunityFeed, type FeedMode, type TrendingWindow } from '../../hooks/useCommunityFeed'
import { CommunityShell } from '../../components/features/community/CommunityShell'
import { MasonryGrid } from '../../components/features/community/MasonryGrid'

// 标签 → (mode, window)。最新走 /posts(sort=new)，三个热门走 /trending。
type TabKey = 'new' | 'day' | 'week' | 'all'
const TABS: { key: TabKey; label: string; mode: FeedMode; window?: TrendingWindow }[] = [
  { key: 'new', label: '最新', mode: 'new' },
  { key: 'day', label: '近 24 小时', mode: 'trending', window: 'day' },
  { key: 'week', label: '近 7 天', mode: 'trending', window: 'week' },
  { key: 'all', label: '总榜', mode: 'trending', window: 'all' },
]

export function CommunityPage() {
  const [tab, setTab] = useState<TabKey>('new')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')

  const active = TABS.find((t) => t.key === tab) ?? TABS[0]
  const params = { mode: active.mode, window: active.window, q: active.mode === 'new' ? q : undefined }

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCommunityFeed(params)

  const posts = useMemo(() => (data ? data.pages.flatMap((p) => p.items) : []), [data])
  const total = data?.pages[0]?.total ?? 0

  const submitSearch = () => {
    setTab('new')
    setQ(qInput.trim())
  }

  // 无限滚动哨兵
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <CommunityShell>
      <PageContainer className="py-12 lg:py-16">
        {/* ── Hero：巨字 + 大留白「大气压场」── */}
        <header className="mb-10 lg:mb-12">
          <span className="fwx-display text-[12px] font-medium uppercase tracking-[0.16em] text-sky-500">
            FlightWoodX 社区
          </span>
          <h1
            className="fwx-display mt-5 text-black/90"
            style={{ fontSize: 'var(--fs-h2)', lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            作品广场
          </h1>
          <p className="mt-7 max-w-[560px] text-[18px] leading-[1.5] text-black/55">
            浏览用户公开发布的无人机设计。登录后可以点赞、评论和收藏，也可以复制作者允许复用的设计并继续编辑。
          </p>
        </header>

        {/* ── 控制条：搜索 + 排行榜入口 + 排序标签（功能/路由不变，仅升视觉）── */}
        <div className="mb-14 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:mb-16">
          <div className="relative w-full sm:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/40" />
            <input
              placeholder="搜索作品名…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
              className="w-full rounded-full border border-black/[0.08] bg-white py-3 pl-11 pr-4 text-[15px] text-black/80 outline-none transition placeholder:text-black/35 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 gap-y-2.5 self-start sm:flex-nowrap sm:self-auto">
            {/* 排行榜入口：与标签同套药丸，低饱和、不抢点睛蓝 */}
            <Link
              to="/community/leaderboard"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-50 px-4 py-2.5 text-[14px] font-medium text-black/70 ring-1 ring-black/[0.05] transition-colors hover:bg-sky-100 hover:text-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Trophy size={15} className="text-sky-500" />
              排行榜
            </Link>
            <div className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 p-1 ring-1 ring-black/[0.05]">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-full px-3 py-1.5 text-[14px] font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:px-4 ${
                    tab === t.key ? 'bg-sky-500 text-white shadow-soft' : 'text-black/55 hover:text-black/90'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 三态 ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 items-start gap-5 sm:grid-cols-3 sm:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05]">
                <div className="aspect-[4/3] animate-pulse bg-paper-100" />
                <div className="space-y-2.5 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-paper-100" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-paper-100" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-dashed border-black/[0.08] bg-white/50 py-24 text-center">
            <p className="text-[18px] text-black/55">作品列表加载失败</p>
            <button
              onClick={() => refetch()}
              className="mt-5 rounded-full bg-sky-500 px-6 py-2.5 text-[14px] font-medium text-white shadow-soft transition hover:bg-sky-600"
            >
              重试
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/[0.08] bg-white/50 py-24 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-black/[0.05]">
              <ImageOff size={26} className="text-sky-300" />
            </div>
            <p className="mx-auto max-w-[420px] text-[18px] leading-[1.5] text-black/55">
              {active.mode === 'new' && q
                ? `没有找到与「${q}」相关的作品`
                : active.mode === 'trending'
                  ? '此榜单暂无作品。'
                  : '社区暂无公开作品。已保存的作品可从工作台发布到社区。'}
            </p>
          </div>
        ) : (
          <>
            <MasonryGrid posts={posts} animateKey={`${tab}|${q}`} />
            <div ref={sentinelRef} className="h-8" aria-hidden="true" />
            {isFetchingNextPage && (
              <p className="flex items-center justify-center gap-2 pb-2 pt-6 text-[14px] text-black/40">
                <Loader2 size={15} className="animate-spin" /> 加载更多…
              </p>
            )}
            {!hasNextPage && (
              <p className="fwx-display pb-2 pt-16 text-center text-[13px] uppercase tracking-[0.16em] text-black/40">
                共 {total} 件作品
              </p>
            )}
          </>
        )}
      </PageContainer>
    </CommunityShell>
  )
}
