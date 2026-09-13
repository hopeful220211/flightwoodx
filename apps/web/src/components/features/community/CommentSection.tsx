import { useEffect, useRef, useState } from 'react'
import { MessageCircle, MoreHorizontal, Trash2, Flag, UserCircle2, Send } from 'lucide-react'
import { useToast } from '../../common/Toast'
import { cn } from '../../../utils/cn'
import { useAuthStore } from '../../../stores/authStore'
import {
  useComments,
  useAddComment,
  useDeleteComment,
  useReportComment,
  type CommentDTO,
  type ReportReason,
} from '../../../hooks/useComments'

const MAX_LEN = 300
const REASONS: ReportReason[] = ['垃圾广告', '不友善', '涉及隐私', '其他']

/** 友好的相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期）。 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(then).toLocaleDateString('zh-CN')
}

function Avatar({ comment }: { comment: CommentDTO }) {
  const url = comment.author?.avatar
  if (url) {
    return (
      <img
        src={url}
        alt={comment.author?.username || '用户'}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-sky-100"
        loading="lazy"
      />
    )
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-sky-200/60 ring-1 ring-sky-100">
      <UserCircle2 size={20} className="text-sky-500" aria-hidden />
    </span>
  )
}

/** 单条评论：头像 + 用户名 + 时间 + 正文 + 操作（举报 / 作者删除）。 */
function CommentRow({ comment, postId }: { comment: CommentDTO; postId: string }) {
  const toast = useToast()
  const myId = useAuthStore((s) => s.user?.id)
  const isMine = !!myId && myId === comment.authorId

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const del = useDeleteComment(postId)
  const report = useReportComment()

  // 点外部 / Esc 关闭操作菜单
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const onDelete = () => {
    setMenuOpen(false)
    if (!window.confirm('确定删除这条评论吗？')) return
    del.mutate(comment.id, {
      onSuccess: () => toast.push('success', '已删除'),
      onError: (e) => toast.push('error', e instanceof Error ? e.message : '删除失败'),
    })
  }

  const onReport = (reason: ReportReason) => {
    setMenuOpen(false)
    report.mutate(
      { commentId: comment.id, reason },
      {
        onSuccess: () => toast.push('success', '举报已提交'),
        onError: (e) => toast.push('error', e instanceof Error ? e.message : '举报失败'),
      },
    )
  }

  return (
    <li className="group flex gap-3 rounded-xl px-3 py-3 transition-colors duration-300 hover:bg-sky-50/60">
      <Avatar comment={comment} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-black/90">
            {comment.author?.username || '匿名'}
          </span>
          <span className="shrink-0 text-xs text-black/45">{relativeTime(comment.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-black/75">
          {comment.body}
        </p>
      </div>

      {/* 操作菜单：举报（所有人）/ 删除（仅作者本人） */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            'rounded-full p-1.5 text-black/45 transition-all duration-300 hover:bg-white hover:text-sky-600 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40',
            'opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:opacity-100',
            menuOpen && 'opacity-100 bg-white text-sky-600 shadow-soft',
          )}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="更多操作"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1.5 w-36 overflow-hidden rounded-xl bg-white py-1 shadow-lift ring-1 ring-sky-100"
          >
            {isMine ? (
              <button
                type="button"
                role="menuitem"
                onClick={onDelete}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-500 transition-colors hover:bg-rose-50 focus-visible:bg-rose-50 focus-visible:outline-none"
              >
                <Trash2 size={14} /> 删除
              </button>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-3 pb-1 pt-1 text-xs font-medium text-black/45">
                  <Flag size={12} /> 举报理由
                </div>
                {REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    role="menuitem"
                    onClick={() => onReport(reason)}
                    className="block w-full px-3 py-2 text-left text-sm text-black/75 transition-colors hover:bg-sky-50 focus-visible:bg-sky-50 focus-visible:outline-none"
                  >
                    {reason}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** 社区作品评论区：标题计数 + 发表框（登录后可用）+ 评论列表（三态）。 */
export function CommentSection({ postId }: { postId: string }) {
  const toast = useToast()
  const isLoggedIn = useAuthStore((s) => !!s.token && !s.user?.isGuest)

  const { data, isLoading, isError, refetch } = useComments(postId)
  const add = useAddComment(postId)

  const [draft, setDraft] = useState('')
  const trimmed = draft.trim()
  const nearLimit = draft.length >= MAX_LEN - 30

  const submit = () => {
    if (!trimmed || add.isPending) return
    add.mutate(trimmed, {
      onSuccess: () => {
        setDraft('')
        toast.push('success', '评论已发布')
      },
      onError: (e) => toast.push('error', e instanceof Error ? e.message : '评论失败'),
    })
  }

  const count = data?.total ?? 0

  return (
    <section className="space-y-5" aria-label="评论区">
      <h2 className="flex items-center gap-2 text-base font-semibold text-black/90">
        <MessageCircle size={18} className="text-sky-500" />
        评论
        {count > 0 && (
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-600 ring-1 ring-sky-100">
            {count}
          </span>
        )}
      </h2>

      {/* 发表框：登录后可用，游客提示登录 */}
      {isLoggedIn ? (
        <div className="rounded-2xl bg-sky-50/50 p-3 ring-1 ring-sky-100 transition focus-within:ring-sky-200">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
            placeholder="输入评论，请勿填写个人隐私信息"
            rows={3}
            maxLength={MAX_LEN}
            className={cn(
              'w-full resize-none rounded-xl border border-transparent bg-white px-4 py-3 text-sm leading-relaxed text-black/90 shadow-soft transition placeholder:text-black/45',
              'focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100',
            )}
          />
          <div className="mt-2.5 flex items-center justify-between pl-1">
            <span className={cn('text-xs tabular-nums transition-colors', nearLimit ? 'text-rose-500' : 'text-black/45')}>
              {draft.length}/{MAX_LEN}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!trimmed || add.isPending}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-sky-500 px-5 text-sm font-semibold text-white shadow-soft transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Send size={14} className={add.isPending ? 'animate-pulse motion-reduce:animate-none' : ''} />
              {add.isPending ? '发布中…' : '发布'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-4 py-6 text-center">
          <MessageCircle size={22} className="text-sky-300" />
          <p className="text-sm text-black/55">登录后可以发表评论。</p>
        </div>
      )}

      {/* 列表三态 */}
      {isLoading ? (
        <ul className="space-y-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex gap-3 px-3 py-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-sky-50" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-24 animate-pulse rounded bg-sky-50" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-sky-50" />
              </div>
            </li>
          ))}
        </ul>
      ) : isError ? (
        <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 py-10 text-center">
          <p className="text-sm text-black/55">评论加载失败了</p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            重试
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-sky-100">
            <MessageCircle size={20} className="text-sky-300" />
          </div>
          <p className="text-sm text-black/55">暂无评论</p>
        </div>
      ) : (
        <ul className="-mx-3 divide-y divide-sky-50">
          {data.items.map((c) => (
            <CommentRow key={c.id} comment={c} postId={postId} />
          ))}
        </ul>
      )}
    </section>
  )
}
