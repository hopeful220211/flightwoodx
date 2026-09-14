import { Suspense, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  Heart,
  Share2,
  ImageOff,
  User,
  ArrowUpRight,
  ArrowLeft,
  GitFork,
  Move3d,
  Boxes,
} from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { useToast } from '../../components/common/Toast'
import { useAuthStore } from '../../stores/authStore'
import { useCommunityPost, useToggleLike } from '../../hooks/useCommunity'
import { CommunityShell } from '../../components/features/community/CommunityShell'
import { CommentSection } from '../../components/features/community/CommentSection'
import { SaveToCollectionButton } from '../../components/features/community/SaveToCollectionButton'
import { ReuseButton } from '../../components/features/community/ReuseButton'
import { LikeButton } from '../../components/features/community/LikeButton'
import { AssembledDrone } from '../../components/design/AssembledDrone'
import { PartsList } from '../ExportPreview/PartsList'
import type { Design } from '../../types/design'
import { CATEGORY_LABELS, type PartCategory } from '@fwx/parts-schema'
import { trackEvent } from '../../features/analytics/client'

// 局部入场动画：自带一份关键帧，独立可用，不依赖其它组件注入。
const RISE_KEYFRAMES =
  '@keyframes fwxPostRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}'

/** 一条「零件构成」图例项：全部来自真实零件数据，绝不虚构；分类名消费 @fwx/parts-schema 单一事实源。 */
interface PartComposition {
  category: PartCategory
  label: string
  count: number
}

/**
 * 把真实零件实例按 category 聚合成有序图例。
 * 数据只取 PartInstance 真有的字段（category），不编重量/卡扣点等拿不到的字段。
 * 顺序按 CATEGORY_LABELS 的搭建逻辑排（主板→机臂→…），未知类别垫底。
 */
function deriveComposition(parts: Design['parts']): PartComposition[] {
  const counts = new Map<PartCategory, number>()
  for (const p of parts) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  }
  const order = Object.keys(CATEGORY_LABELS) as PartCategory[]
  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      label: CATEGORY_LABELS[category]?.zh ?? category,
      count,
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.category)
      const ib = order.indexOf(b.category)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
}

/** 是否系统级降低动效——用于关闭 3D 自动旋转与入场动画。 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function CommunityPostPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isLoggedIn = useAuthStore((s) => !!s.token && !s.user?.isGuest)
  const reducedMotion = usePrefersReducedMotion()

  const { data: post, isLoading, isError, refetch } = useCommunityPost(postId)
  const toggleLike = useToggleLike()

  const onBack = () => {
    // 按钮语义就是「返回作品广场」：直达 /community，稳妥可预期（history.length 不保证上一页是社区，
    // 直链/外链进来时 navigate(-1) 可能把人带出站，Codex 评审）。
    navigate('/community')
  }

  const onLike = () => {
    if (!post) return
    if (!isLoggedIn) {
      toast.push('info', '请先登录再点赞')
      return
    }
    toggleLike.mutate({ id: post.id, liked: post.likedByMe })
  }

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      if (post) trackEvent('community_link_copied', { postId: post.id })
      toast.push('success', '链接已复制')
    } catch {
      toast.push('info', '复制失败，请手动复制网址')
    }
  }

  // 客户端兜底过滤（Codex）：即使后端清洗过，也再挡一层脏零件，避免 [null]/缺字段让 3D 组件崩溃。
  const safeParts = (post?.design?.parts ?? []).filter(
    (p) => p && typeof p === 'object' && Array.isArray(p.position) && p.position.length === 3,
  )
  const hasModel = safeParts.length > 0

  // ── 仅由真实零件数据派生的技术指标（TechLabel / 图例都用它，绝不虚构） ──
  const composition = deriveComposition(safeParts)
  const motorCount = safeParts.filter((p) => p.category === 'MOTOR').length
  const propCount = safeParts.filter((p) => p.category === 'PROP').length
  // 轴数：只在能从电机/桨识别出来时才推导，否则不显（不编默认值）。
  const axisCount = Math.max(motorCount, propCount)

  const riseClass = reducedMotion
    ? ''
    : 'motion-safe:animate-[fwxPostRise_0.55s_cubic-bezier(0.22,1,0.36,1)_both]'

  return (
    <CommunityShell>
      <PageContainer className="py-6 lg:py-10">
        <style>{RISE_KEYFRAMES}</style>

        {/* ── 醒目的返回箭头（不是面包屑） ── */}
        <button
          type="button"
          onClick={onBack}
          aria-label="返回作品广场"
          className="group inline-flex items-center gap-2.5 rounded-full bg-white/80 py-2 pl-2 pr-5 text-sm font-medium text-black/70 shadow-soft ring-1 ring-black/5 backdrop-blur transition-all duration-300 hover:-translate-x-1 hover:bg-white hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 text-sky-500 transition-colors group-hover:bg-sky-100">
            <ArrowLeft size={19} />
          </span>
          返回作品广场
        </button>

        {isLoading ? (
          <PostSkeleton />
        ) : isError || !post ? (
          <div className="mt-8 rounded-2xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
              <ImageOff size={24} className="text-sky-300" />
            </div>
            <p className="text-black/55">作品不存在或加载失败了</p>
            <button
              onClick={() => refetch()}
              className="mt-4 rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              重试
            </button>
          </div>
        ) : (
          <div className={`mt-8 space-y-16 lg:mt-10 lg:space-y-20 ${riseClass}`}>
            {/* ── 移动端专属：标题先于 3D（保证手机先看到作品名） ── */}
            <div className="lg:hidden">
              {post.forkFrom && <ForkLineageChip forkFrom={post.forkFrom} className="mb-4" />}
              <PostHeadline title={post.title} likeCount={post.likeCount} favoriteCount={post.favoriteCount} />
            </div>

            {/* ── 沉浸式主区：info 左（5）/ 3D 大图 右（7），不对称 ── */}
            <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-14">
              {/* 左列：标题 + 作者 + 操作 + 介绍 + 零件构成（桌面在前，移动端退到 3D 之后） */}
              <div className="order-2 flex flex-col gap-10 lg:order-1 lg:gap-12">
                {/* 桌面端标题（移动端已在顶部渲染） */}
                <div className="hidden lg:block">
                  {post.forkFrom && <ForkLineageChip forkFrom={post.forkFrom} className="mb-5" />}
                  <PostHeadline title={post.title} likeCount={post.likeCount} favoriteCount={post.favoriteCount} />
                </div>

                {/* 作者 + 操作条：合成一张干净的胶囊操作组 */}
                <div className="space-y-5">
                  {/* 作者卡 */}
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-100 to-sky-200/60 ring-1 ring-sky-100">
                      {post.author?.avatar ? (
                        <img src={post.author.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User size={22} className="text-sky-500" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-black/45 fwx-mono">CREATOR</p>
                      {post.author ? (
                        <Link
                          to={`/u/${post.author.id}`}
                          className="group inline-flex items-center gap-1 text-lg font-medium text-black/90 transition-colors hover:text-sky-600"
                        >
                          {post.author.username}
                          <ArrowUpRight
                            size={15}
                            className="text-sky-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          />
                        </Link>
                      ) : (
                        <span className="text-lg font-medium text-black/90">匿名创作者</span>
                      )}
                    </div>
                  </div>

                  {/* 操作条：点赞 / 收藏 / 复用（独立组件）+ 分享（本页胶囊） */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <LikeButton liked={post.likedByMe} count={post.likeCount} onToggle={onLike} />
                    <SaveToCollectionButton postId={post.id} />
                    {post.project && (
                      <ReuseButton
                        postId={post.id}
                        projectId={post.project.id}
                        reusable={post.project.reusable}
                      />
                    )}
                    <button
                      type="button"
                      onClick={onShare}
                      aria-label="复制链接分享"
                      className="group inline-flex min-h-[48px] items-center gap-2 rounded-full border border-sky-200 bg-white py-2 pl-5 pr-2 text-sm font-medium text-black/70 shadow-sm transition-all duration-300 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      分享
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-500 transition-colors group-hover:bg-sky-100">
                        <Share2 size={15} />
                      </span>
                    </button>
                  </div>
                </div>

                {/* 作品介绍 */}
                <div className="max-w-[560px]">
                  <p className="text-[12px] uppercase tracking-[0.16em] text-sky-500 fwx-mono">ABOUT</p>
                  <h2 className="mt-2 text-2xl font-medium tracking-tight text-black/90 fwx-display">
                    作品介绍
                  </h2>
                  <p className="mt-4 whitespace-pre-wrap text-[18px] leading-[1.6] text-black/70">
                    {post.description || '作者尚未填写作品介绍。'}
                  </p>
                </div>

                {/* 零件构成图例：仅在有真实零件时显示，编号①②③用真分类/数量 —— 用真数据做 hotspots 思路 */}
                {hasModel && composition.length > 0 && (
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.16em] text-sky-500 fwx-mono">COMPOSITION</p>
                    <h2 className="mt-2 text-2xl font-medium tracking-tight text-black/90 fwx-display">
                      零件构成
                    </h2>
                    <ul className="mt-5 space-y-3">
                      {composition.map((c, i) => (
                        <li key={c.category} className="flex items-center gap-4">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[13px] font-semibold text-sky-600 ring-1 ring-sky-100 fwx-mono">
                            {i + 1}
                          </span>
                          <span className="flex-1 text-[18px] text-black/80">{c.label}</span>
                          <span className="text-[18px] font-medium text-black/55 fwx-mono tabular-nums">
                            ×{c.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 右列：3D 大图（视觉主角）或封面兜底 + 角落 TechLabel */}
              <section className="order-1 lg:order-2 lg:sticky lg:top-6">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 via-paper-50 to-white shadow-soft ring-1 ring-black/5">
                  <div className="relative aspect-square w-full lg:aspect-auto lg:h-[clamp(30rem,72vh,46rem)]">
                    {hasModel ? (
                      <>
                        <Canvas
                          camera={{ position: [0.35, 0.3, 0.45], fov: 50 }}
                          dpr={[1, 2]}
                          className="!touch-none"
                        >
                          <ambientLight intensity={1.45} />
                          <directionalLight position={[5, 5, 5]} intensity={2.3} />
                          <directionalLight position={[-4, 2, -3]} intensity={0.65} />
                          <directionalLight position={[0, -3, 2]} intensity={0.35} />
                          <Suspense fallback={null}>
                            <AssembledDrone parts={safeParts} autoRotate={!reducedMotion} />
                          </Suspense>
                          <OrbitControls
                            makeDefault
                            enablePan={false}
                            enableDamping
                            minDistance={0.2}
                            maxDistance={1.5}
                          />
                        </Canvas>
                        {/* 拖动旋转提示 */}
                        <div className="pointer-events-none absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3.5 py-2 text-xs font-medium text-black/60 shadow-sm ring-1 ring-black/5 backdrop-blur">
                          <Move3d size={14} className="text-sky-500" />
                          拖动可旋转查看
                        </div>
                        {/* 角落 TechLabel：仪表盘式真数据标注（只标拿得到的字段） */}
                        <TechLabel
                          partCount={safeParts.length}
                          axisCount={axisCount}
                          motorCount={motorCount}
                        />
                      </>
                    ) : post.project?.coverUrl ? (
                      <img
                        src={post.project.coverUrl}
                        alt={post.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageOff size={48} className="text-sky-200" />
                      </div>
                    )}
                    {/* 底部防刺眼渐变 */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/10 to-transparent" />
                  </div>
                  {/* caption */}
                  <div className="flex items-center justify-between gap-3 border-t border-black/5 bg-white/60 px-5 py-3 backdrop-blur">
                    <p className="truncate text-xs text-black/50 fwx-mono">
                      {hasModel ? '木质榫卯飞行器 · 3D 预览' : '作品预览图'}
                    </p>
                    {hasModel && (
                      <span className="shrink-0 text-[11px] font-medium text-sky-500 fwx-mono">
                        实时渲染
                      </span>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* ── 零件清单 / 兜底说明（整宽，承接 PartsList 自身的版式） ── */}
            {hasModel ? (
              <section className="overflow-hidden rounded-2xl shadow-soft ring-1 ring-black/5">
                <PartsList parts={safeParts} />
              </section>
            ) : (
              <section className="rounded-2xl bg-white px-6 py-14 text-center shadow-soft ring-1 ring-black/5 sm:py-20">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-sky-100">
                  <Boxes size={26} className="text-sky-300" />
                </div>
                <p className="text-lg font-medium text-black/80 fwx-display">暂无模型数据</p>
                <p className="mt-1.5 text-sm text-black/50">暂无可旋转的 3D 模型 / 零件清单</p>
              </section>
            )}

            {/* ── 评论区 ── */}
            <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-black/5 sm:p-6">
              <CommentSection postId={post.id} />
            </section>
          </div>
        )}
      </PageContainer>
    </CommunityShell>
  )
}

/** fork 血缘只读 chip（标题前的「再创作自」），桌面/移动端复用，避免重复 JSX。 */
function ForkLineageChip({
  forkFrom,
  className = '',
}: {
  forkFrom: { postId: string; authorName?: string | null; title: string }
  className?: string
}) {
  return (
    <Link
      to={`/community/${forkFrom.postId}`}
      className={`inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-sky-50 px-3.5 py-1.5 text-xs font-medium text-sky-600 ring-1 ring-sky-100 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${className}`}
    >
      <GitFork size={12} className="shrink-0" />
      <span className="truncate">
        基于 @{forkFrom.authorName || '某位创作者'} 的《{forkFrom.title}》再创作
      </span>
    </Link>
  )
}

/** 作品大标题块（标题 + 喜欢/收藏计数），桌面/移动端复用同一份。 */
function PostHeadline({
  title,
  likeCount,
  favoriteCount,
}: {
  title: string
  likeCount: number
  favoriteCount: number
}) {
  return (
    <div className="min-w-0">
      <h1 className="fwx-display break-words [overflow-wrap:anywhere] font-medium leading-[1.05] tracking-tight text-black/90 [font-size:max(40px,4.5vw)]">
        {title}
      </h1>
      <p className="mt-4 flex items-center gap-1.5 text-sm text-black/55 fwx-mono">
        <Heart size={13} className="text-rose-400" fill="currentColor" />
        <span className="tabular-nums">{likeCount}</span> 人喜欢
        {favoriteCount > 0 && (
          <span className="text-black/45">
            · <span className="tabular-nums">{favoriteCount}</span> 人收藏
          </span>
        )}
      </p>
    </div>
  )
}

/**
 * 角落技术标注（TechLabel）：仪表盘式等宽真数据。
 * 只标拿得到的字段：零件总数（真）、轴数与电机数（仅在能从零件识别出来时显示）。
 * 总重、卡扣点数等 PartInstance 拿不到的字段——不编、不显。
 */
function TechLabel({
  partCount,
  axisCount,
  motorCount,
}: {
  partCount: number
  axisCount: number
  motorCount: number
}) {
  const rows: { k: string; v: string }[] = [{ k: 'PARTS', v: String(partCount) }]
  if (axisCount > 0) rows.push({ k: 'AXES', v: String(axisCount) })
  if (motorCount > 0) rows.push({ k: 'MOTORS', v: String(motorCount) })
  return (
    <div className="pointer-events-none absolute bottom-5 right-5 rounded-xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-black/5 backdrop-blur fwx-mono">
      <div className="flex items-stretch gap-4">
        {rows.map((r, i) => (
          <div
            key={r.k}
            className={`flex flex-col gap-0.5 ${i > 0 ? 'border-l border-black/10 pl-4' : ''}`}
          >
            <span className="text-[10px] uppercase tracking-[0.12em] text-black/60">{r.k}</span>
            <span className="text-[22px] font-medium leading-none tabular-nums text-sky-600">
              {r.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 详情骨架屏：与正式布局（info 左 5 / 3D 右 7）同构，避免加载→渲染的跳动。 */
function PostSkeleton() {
  return (
    <div className="mt-8 space-y-16 lg:mt-10 lg:space-y-20">
      {/* 移动端标题占位 */}
      <div className="lg:hidden">
        <div className="h-12 w-3/4 animate-pulse rounded-lg bg-sky-50" />
        <div className="mt-4 h-4 w-32 animate-pulse rounded bg-sky-50" />
      </div>
      <div className="grid gap-10 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-14">
        {/* 左：info（桌面在前） */}
        <div className="order-2 flex flex-col gap-10 lg:order-1 lg:gap-12">
          <div className="hidden lg:block">
            <div className="h-14 w-3/4 animate-pulse rounded-lg bg-sky-50" />
            <div className="mt-4 h-4 w-32 animate-pulse rounded bg-sky-50" />
          </div>
          <div className="space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="h-14 w-14 animate-pulse rounded-full bg-sky-50" />
              <div className="h-9 w-40 animate-pulse rounded-lg bg-sky-50" />
            </div>
            <div className="flex gap-2.5">
              <div className="h-12 w-24 animate-pulse rounded-full bg-sky-50" />
              <div className="h-12 w-24 animate-pulse rounded-full bg-sky-50" />
              <div className="h-12 w-28 animate-pulse rounded-full bg-sky-50" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-sky-50" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-sky-50" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-sky-50" />
          </div>
        </div>
        {/* 右：3D 大图 */}
        <div className="order-1 aspect-square w-full animate-pulse rounded-2xl bg-sky-50 lg:order-2 lg:aspect-auto lg:h-[clamp(30rem,72vh,46rem)]" />
      </div>
      <div className="h-44 animate-pulse rounded-2xl bg-sky-50" />
    </div>
  )
}
