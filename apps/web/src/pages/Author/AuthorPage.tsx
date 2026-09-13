import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { UserRound, ImageOff, Loader2, Users } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { CommunityShell } from '../../components/features/community/CommunityShell'
import { FollowButton } from '../../components/features/community/FollowButton'
import { MasonryGrid } from '../../components/features/community/MasonryGrid'
import { useAuthor } from '../../hooks/useFollow'

/** 创作者主页 /u/:userId：高端信息头卡 + 其作品瀑布流（MasonryGrid，无限滚动）。 */
export function AuthorPage() {
  const { userId } = useParams<{ userId: string }>()
  const nav = useNavigate()

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuthor(userId)

  // 作者信息取第一页（每页都带回最新计数，取首页即可）；作品 flatMap 所有页。
  const author = data?.pages[0]?.author
  const posts = useMemo(() => (data ? data.pages.flatMap((p) => p.posts.items) : []), [data])

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

  // 首屏加载（还没有作者数据）：头卡骨架 + 瀑布流骨架。
  if (isLoading && !author) {
    return (
      <CommunityShell>
        <PageContainer className="py-10 lg:py-14">
          <div className="mb-10 overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
            <div className="h-28 animate-pulse bg-gradient-to-br from-sky-100 to-sky-50 sm:h-32" />
            <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="-mt-12 h-24 w-24 animate-pulse rounded-full bg-sky-100 ring-4 ring-white" />
                <div className="space-y-2 pb-1">
                  <div className="h-6 w-40 animate-pulse rounded bg-sky-50" />
                  <div className="h-4 w-52 animate-pulse rounded bg-sky-50" />
                </div>
              </div>
              <div className="h-11 w-28 animate-pulse rounded-full bg-sky-50" />
            </div>
          </div>
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
        </PageContainer>
      </CommunityShell>
    )
  }

  if (isError || !author) {
    return (
      <CommunityShell>
        <PageContainer className="py-20">
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
              <UserRound size={24} className="text-sky-300" />
            </div>
            <p className="text-black/70">没有找到这位创作者</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => refetch()}
                className="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-sky-600"
              >
                重试
              </button>
              <button
                onClick={() => nav('/community')}
                className="rounded-full px-5 py-2 text-sm font-medium text-black/45 transition hover:text-black/70"
              >
                返回社区
              </button>
            </div>
          </div>
        </PageContainer>
      </CommunityShell>
    )
  }

  return (
    <CommunityShell>
      <PageContainer className="py-10 lg:py-14">
        {/* ── 创作者头卡：天蓝封面带 + 大头像（渐变环）+ 用户名 + 统计 + 关注按钮 ── */}
        <header className="mb-10 overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
          <div className="relative h-28 bg-sky-hero sm:h-32">
            <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent" />
          </div>
          <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              {/* 渐变环大头像，压在封面带上 */}
              <div className="-mt-14 rounded-full bg-gradient-to-br from-sky-300 to-sky-500 p-[3px] shadow-sky-glow">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white ring-4 ring-white">
                  {author.avatar ? (
                    <img src={author.avatar} alt={author.username} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-sky-50">
                      <UserRound size={40} className="text-sky-300" />
                    </div>
                  )}
                </div>
              </div>
              <div className="pb-1">
                <h1 className="fwx-display text-3xl font-semibold tracking-tight text-black/90 lg:text-4xl">{author.username}</h1>
                <div className="mt-2 flex items-center gap-4 text-sm text-black/45">
                  <span className="inline-flex items-baseline gap-1">
                    <span className="text-base font-semibold text-black/90">{author.followerCount}</span> 关注者
                  </span>
                  <span className="h-3 w-px bg-sky-100" aria-hidden="true" />
                  <span className="inline-flex items-baseline gap-1">
                    <span className="text-base font-semibold text-black/90">{author.followingCount}</span> 关注
                  </span>
                </div>
              </div>
            </div>
            <div className="shrink-0 sm:pb-1">
              <FollowButton userId={author.id} initialFollowed={author.isFollowedByMe} />
            </div>
          </div>
        </header>

        {/* ── 作品墙：标题条 + 瀑布流 / 空态 ── */}
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-black/90">作者的公开作品</h2>
          {posts.length > 0 && <span className="text-sm text-black/45">已加载 {posts.length} 件</span>}
        </div>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
              <ImageOff size={24} className="text-sky-300" />
            </div>
            <p className="text-black/45">这位创作者还没有发布作品</p>
          </div>
        ) : (
          <>
            <MasonryGrid posts={posts} animateKey={userId} />
            <div ref={sentinelRef} className="h-8" aria-hidden="true" />
            {isFetchingNextPage && (
              <p className="flex items-center justify-center gap-2 pb-2 pt-4 text-sm text-black/45">
                <Loader2 size={15} className="animate-spin" /> 加载更多…
              </p>
            )}
            {!hasNextPage && (
              <p className="flex items-center justify-center gap-1.5 pb-2 pt-8 text-center text-sm text-black/35">
                <Users size={13} /> 已显示全部作品
              </p>
            )}
          </>
        )}
      </PageContainer>
    </CommunityShell>
  )
}
