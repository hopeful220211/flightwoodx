import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Users, Compass, Loader2, Heart } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { useAuthStore } from '../../stores/authStore'
import { CommunityShell } from '../../components/features/community/CommunityShell'
import { MasonryGrid } from '../../components/features/community/MasonryGrid'
import { useFollowingFeed } from '../../hooks/useFollow'

/** 我的关注 /feed：所关注创作者的最新作品瀑布流（MasonryGrid，无限滚动）。需登录。 */
export function FollowingFeedPage() {
  const nav = useNavigate()
  const isLoggedIn = useAuthStore((s) => !!s.token && !s.user?.isGuest)

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFollowingFeed()

  const posts = useMemo(() => (data ? data.pages.flatMap((p) => p.items) : []), [data])

  // 无限滚动：底部哨兵进入视口即加载下一页。
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '480px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // 未登录（含游客）兜底：理论上由 ProtectedRoute 拦截，这里再给一层友好引导。
  if (!isLoggedIn) {
    return (
      <CommunityShell>
        <PageContainer className="py-20">
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
              <Users size={24} className="text-sky-300" />
            </div>
            <p className="text-black/45">登录后才能查看你的关注</p>
            <button
              onClick={() => nav('/login')}
              className="mt-4 rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-sky-600"
            >
              去登录
            </button>
          </div>
        </PageContainer>
      </CommunityShell>
    )
  }

  return (
    <CommunityShell>
      <PageContainer className="py-10 lg:py-14">
        {/* ── Hero ── */}
        <header className="mb-8 lg:mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-normal text-sky-500 ring-1 ring-sky-100 backdrop-blur">
            <Heart size={12} /> 我的关注
          </span>
          <h1 className="fwx-display mt-4 text-4xl font-semibold tracking-tight text-black/90 lg:text-5xl">关注动态</h1>
          <p className="mt-3 max-w-xl text-black/55">查看你关注的作者新发布的公开作品。</p>
        </header>

        {/* ── 三态 ── */}
        {isLoading ? (
          <div className="flex gap-5">
            {Array.from({ length: 4 }).map((_, c) => (
              <div key={c} className="flex flex-1 flex-col gap-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.04]">
                    <div className="aspect-[4/5] animate-pulse bg-paper-100" />
                    <div className="space-y-2 p-4">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-paper-100" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-paper-100" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <p className="text-black/45">关注动态加载失败了</p>
            <button
              onClick={() => refetch()}
              className="mt-3 rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-sky-600"
            >
              重试
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
              <Users size={28} className="text-sky-300" />
            </div>
            <p className="text-black/70">暂无关注作者的公开作品</p>
            <p className="mt-1 text-sm text-black/45">可以在社区作品或作者主页中添加关注。</p>
            <button
              onClick={() => nav('/community')}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sky-glow transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-sky-600 hover:shadow-lift active:scale-[0.97] motion-reduce:transition-none"
            >
              <Compass size={16} /> 查看社区作品
            </button>
          </div>
        ) : (
          <>
            <MasonryGrid posts={posts} />
            <div ref={sentinelRef} className="h-8" aria-hidden="true" />
            {isFetchingNextPage && (
              <p className="flex items-center justify-center gap-2 pb-2 pt-4 text-sm text-black/45">
                <Loader2 size={15} className="animate-spin" /> 加载更多…
              </p>
            )}
            {!hasNextPage && (
              <p className="flex items-center justify-center gap-1.5 pb-2 pt-8 text-center text-sm text-black/35">
                <Heart size={13} /> 已显示全部作品
              </p>
            )}
          </>
        )}
      </PageContainer>
    </CommunityShell>
  )
}
