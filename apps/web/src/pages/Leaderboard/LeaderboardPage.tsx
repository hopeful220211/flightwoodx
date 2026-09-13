import { useMemo } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Crown, Heart, ImageOff, Medal, Sparkles } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { CommunityShell } from '../../components/features/community/CommunityShell'
import { apiFetch } from '../../utils/api'

const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'

/** 排行榜行视图：与 trending PostCard 同形（只取榜单要用的字段）。 */
interface LeaderRow {
  id: string
  title: string
  author: { id: string; username: string; avatar?: string } | null
  coverUrl?: string
  likeCount: number
}

interface TrendingResponse {
  items: LeaderRow[]
  total: number
}

async function fetchLeaderboard(): Promise<LeaderRow[]> {
  const res = await apiFetch<TrendingResponse>('/community/trending?window=all&pageSize=30')
  if (!res.success || !res.data) throw new Error(res.error || '获取排行榜失败')
  // apiFetch 透传 { items, total }；统一取 items（兜底空数组）。
  return res.data.items ?? []
}

/**
 * 名次配色与文案：1 金 / 2 银 / 3 铜。
 * grad/badge 走浅色金银铜（装饰），score 走 *-600 深一档 —— 大字在白底达 WCAG AA。
 */
const PODIUM = {
  1: { grad: 'from-amber-300 to-amber-500', badge: 'bg-amber-400', label: '第 1 名', score: 'text-amber-600', glow: 'shadow-[0_18px_50px_rgba(245,180,30,.30)]' },
  2: { grad: 'from-slate-300 to-slate-400', badge: 'bg-slate-400', label: '第 2 名', score: 'text-slate-600', glow: 'shadow-lift' },
  3: { grad: 'from-orange-300 to-orange-500', badge: 'bg-orange-400', label: '第 3 名', score: 'text-orange-600', glow: 'shadow-lift' },
} as const

function likeText(n: number) {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n)
}

function initials(name?: string) {
  return (name || '匿').trim().slice(0, 1)
}

/** 点赞排行榜 /community/leaderboard：总榜 Top 30 —— 前三名领奖台 + 第 4~30 名榜单。 */
export function LeaderboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['community', 'leaderboard', 'all'],
    queryFn: fetchLeaderboard,
  })

  const rows = useMemo(() => data ?? [], [data])
  const top3 = rows.slice(0, 3)
  const rest = rows.slice(3)

  return (
    <CommunityShell>
      <PageContainer className="py-10 lg:py-14">
        {/* ── Hero ── */}
        <header className="mb-10 lg:mb-14">
          <span className="fwx-display inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[12px] font-medium uppercase tracking-[0.2em] text-sky-600 ring-1 ring-sky-100 backdrop-blur">
            <Trophy size={12} /> 社区榜单
          </span>
          <h1 className="fwx-display mt-5 font-semibold leading-[1.05] tracking-tight text-black/90 [font-size:max(40px,4.5vw)]">
            点赞排行榜
          </h1>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-black/55">
            按总点赞数展示社区公开作品，最多显示 30 件。点击作品可查看详情。
          </p>
        </header>

        {isLoading ? (
          <LeaderboardSkeleton />
        ) : isError ? (
          <div className="rounded-3xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <p className="text-[15px] text-black/55">排行榜加载失败了</p>
            <button
              onClick={() => refetch()}
              className={`mt-4 inline-flex items-center rounded-full bg-sky-500 px-5 py-2.5 text-sm font-medium text-white shadow-sky-glow transition-all hover:bg-sky-600 ${EASE}`}
            >
              重试
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-sky-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
              <Sparkles size={24} className="text-sky-300" />
            </div>
            <p className="text-[15px] text-black/55">排行榜暂无作品。</p>
            <Link
              to="/community"
              className={`mt-5 inline-flex items-center rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sky-glow transition-all hover:bg-sky-600 ${EASE}`}
            >
              查看社区作品
            </Link>
          </div>
        ) : (
          <>
            {top3.length > 0 && <Podium top3={top3} />}
            {rest.length > 0 && (
              <ol className="mt-10 space-y-3 lg:mt-16">
                {rest.map((row, i) => (
                  <RankRow key={row.id} row={row} rank={i + 4} />
                ))}
              </ol>
            )}
            <p className="fwx-display pb-2 pt-12 text-center text-[13px] tracking-wide text-black/40">
              · 共上榜 <span className="tabular-nums text-black/55">{rows.length}</span> 件作品 ·
            </p>
          </>
        )}
      </PageContainer>
    </CommunityShell>
  )
}

/** 前三名领奖台：桌面端 2-1-3 三柱（冠军居中最大、抬高），移动端竖排 1→2→3。 */
function Podium({ top3 }: { top3: LeaderRow[] }) {
  // 视觉顺序：亚军(左) · 冠军(中) · 季军(右)；DOM 仍按名次写出，靠 order 调位以利可读与无障碍。
  const orderClass: Record<number, string> = {
    1: 'order-1 sm:order-2',
    2: 'order-2 sm:order-1',
    3: 'order-3 sm:order-3',
  }
  return (
    <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-5">
      {top3.map((row, i) => {
        const rank = (i + 1) as 1 | 2 | 3
        return (
          <div key={row.id} className={`${orderClass[rank]} sm:flex-1 sm:max-w-xs`}>
            <PodiumCard row={row} rank={rank} />
          </div>
        )
      })}
    </div>
  )
}

function PodiumCard({ row, rank }: { row: LeaderRow; rank: 1 | 2 | 3 }) {
  const p = PODIUM[rank]
  const isChamp = rank === 1
  return (
    <Link
      to={`/community/${row.id}`}
      className={`group relative block overflow-hidden rounded-3xl bg-white ring-1 ring-black/5 ${p.glow} transition-all ${EASE} hover:-translate-y-1.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        isChamp ? 'sm:-mb-2' : ''
      }`}
    >
      {/* 名次徽标 */}
      <span
        className={`absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full ${p.badge} text-base font-bold text-white shadow-soft ring-2 ring-white`}
      >
        {rank}
      </span>
      {isChamp && (
        <span className="absolute -top-0.5 left-1/2 z-10 -translate-x-1/2 text-amber-400 drop-shadow-sm">
          <Crown size={26} fill="currentColor" />
        </span>
      )}

      {/* 封面（冠军更大） */}
      <div
        className={`relative overflow-hidden bg-gradient-to-br from-paper-100 to-sky-50/60 ${
          isChamp ? 'aspect-[4/3] sm:aspect-square' : 'aspect-[4/3]'
        }`}
      >
        {row.coverUrl ? (
          <img
            src={row.coverUrl}
            alt={row.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff size={28} className="text-sky-200" />
          </div>
        )}
        {/* 名次渐变环（顶部细色条，呼应金银铜） */}
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${p.grad}`} />
      </div>

      <div className={`p-4 ${isChamp ? 'sm:p-5' : ''}`}>
        <span className={`inline-flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.16em] ${p.score}`}>
          <Medal size={13} /> {p.label}
        </span>
        <h3 className={`fwx-display mt-2 truncate font-semibold text-black/90 ${isChamp ? 'text-lg' : 'text-base'}`}>{row.title}</h3>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[10px] font-semibold text-sky-600">
            {row.author?.avatar ? (
              <img src={row.author.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(row.author?.username)
            )}
          </span>
          <span className="truncate text-[13px] text-black/55">{row.author?.username || '匿名'}</span>
        </div>

        {/* BigStat：分数为卡片视觉焦点 —— 大字呼应名次金/银/铜 */}
        <div className="mt-4 flex items-baseline gap-1.5 border-t border-black/[0.06] pt-4">
          <Heart size={isChamp ? 18 : 16} fill="currentColor" className={`${p.score} translate-y-[-0.18em]`} aria-hidden />
          <span
            className={`fwx-display font-semibold leading-none tabular-nums ${p.score} ${
              isChamp ? '[font-size:max(56px,4vw)]' : 'text-[48px]'
            }`}
          >
            {likeText(row.likeCount)}
          </span>
          <span className="ml-0.5 text-[12px] font-medium text-black/55">赞</span>
        </div>
      </div>
    </Link>
  )
}

/** 第 4 名起的榜单行：名次 + 缩略图 + 标题/作者 + 点赞数，hover 上浮。 */
function RankRow({ row, rank }: { row: LeaderRow; rank: number }) {
  return (
    <li>
      <Link
        to={`/community/${row.id}`}
        className={`group flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-5 shadow-soft ring-1 ring-black/[0.04] transition-all ${EASE} hover:-translate-y-0.5 hover:shadow-lift hover:ring-sky-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:gap-4`}
      >
        <span className="fwx-display w-8 shrink-0 text-center text-lg font-medium tabular-nums text-black/55 sm:w-11 sm:text-xl">
          {rank}
        </span>
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-paper-100 to-sky-50/60 sm:h-16 sm:w-16">
          {row.coverUrl ? (
            <img
              src={row.coverUrl}
              alt={row.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff size={20} className="text-sky-200" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="fwx-display truncate text-[15px] font-semibold text-black/90 sm:text-base">{row.title}</h3>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[9px] font-semibold text-sky-600">
              {row.author?.avatar ? (
                <img src={row.author.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(row.author?.username)
              )}
            </span>
            <span className="truncate text-[13px] text-black/55">{row.author?.username || '匿名'}</span>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-baseline gap-1.5">
          <Heart size={14} fill="currentColor" className="translate-y-[0.15em] text-rose-400" aria-hidden />
          <span className="fwx-display text-xl font-semibold tabular-nums text-black/90 sm:text-2xl">{likeText(row.likeCount)}</span>
        </span>
      </Link>
    </li>
  )
}

/** 骨架：领奖台三柱 + 几行榜单。 */
function LeaderboardSkeleton() {
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sm:flex-1 sm:max-w-xs">
            <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-black/5">
              <div className={`animate-pulse bg-paper-100 ${i === 1 ? 'aspect-[4/3] sm:aspect-square' : 'aspect-[4/3]'}`} />
              <div className="p-4">
                <div className="h-3 w-1/3 animate-pulse rounded bg-paper-100" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-paper-100" />
                <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-paper-100" />
                {/* BigStat 占位 */}
                <div className="mt-4 border-t border-black/[0.06] pt-4">
                  <div className="h-11 w-1/2 animate-pulse rounded-lg bg-paper-100" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl bg-white p-2.5 pr-5 ring-1 ring-black/[0.04]">
            <div className="h-6 w-8 animate-pulse rounded bg-paper-100 sm:w-11" />
            <div className="h-16 w-16 animate-pulse rounded-xl bg-paper-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-paper-100" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-paper-100" />
            </div>
            <div className="h-6 w-12 animate-pulse rounded bg-paper-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
