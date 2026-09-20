import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, PencilLine, Send, Trash2 } from 'lucide-react'
import { cn } from '../../../utils/cn'
import { Badge } from '../../../components/common/Badge'
import type { Design } from '../../../types/design'
import { isAssemblyComplete } from '../workStatus'
import { WorkThumbnail } from './WorkThumbnail'
import { coverKeyOf } from './coverKey'

/**
 * 工作台单张作品卡（像 WPS / 飞书的文件卡）。
 *
 * 预览图 + 作品名 + 上次修改时间 + 真实状态标签（草稿 / 装配完成）+「打开」+ 显式「⋯」菜单（重命名 / 删除）。
 * 移动端没有 hover，所以「打开」与「⋯」都是常驻显式按钮，不靠悬停。整卡可点 = 打开它自己。
 */
export interface WorkCardProps {
  design: Design
  onOpen: (d: Design) => void
  onRename: (d: Design) => void
  onDelete: (d: Design) => void
  /** 发布到社区（仅登录用户提供；未提供则不显示该菜单项）。 */
  onPublish?: (d: Design) => void
  /** 缩略图抓到 3D 定格图时回调（登录用户把它存为服务器封面）。 */
  onCaptureCover?: (d: Design, blob: Blob) => void
}

/** updatedAt → 友好相对时间（刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / 年月日）。 */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  const d = new Date(then)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function WorkCard({ design, onOpen, onRename, onDelete, onPublish, onCaptureCover }: WorkCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部 / Esc 关闭「⋯」菜单。
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const assemblyComplete = isAssemblyComplete(design)

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-card border border-sky-100/70 bg-white text-left',
        'shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-sky-glow',
      )}
    >
      {/* 预览（整块可点 = 打开它自己） */}
      <div className="relative block aspect-video w-full overflow-hidden bg-sky-50">
        {/* key 含 updatedAt/零件数：设计一改即重挂载缩略图，重新抓封面 */}
        <WorkThumbnail
          key={coverKeyOf(design)}
          design={design}
          onCapture={onCaptureCover ? (blob) => onCaptureCover(design, blob) : undefined}
        />
        <button
          type="button"
          onClick={() => onOpen(design)}
          aria-label={`打开 ${design.name}`}
          className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-spark"
        />
        <span className="pointer-events-none absolute left-2.5 top-2.5 z-20">
          <Badge variant={assemblyComplete ? 'completed' : 'draft'}>
            {assemblyComplete ? '装配完成' : '草稿'}
          </Badge>
        </span>
      </div>

      {/* 信息 + 操作 */}
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-sky-900">{design.name}</h3>
          <p className="mt-0.5 text-xs text-ink-400">
            上次修改 {formatRelativeTime(design.updatedAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(design)}
            className="inline-flex min-h-[36px] items-center rounded-pill bg-accent-spark px-4 text-sm font-semibold text-white shadow-sky-glow transition hover:brightness-110 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-spark"
          >
            打开
          </button>

          {/* 显式「⋯」按钮（移动端无 hover，必须常驻） */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sky-500 transition hover:bg-sky-50 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-spark"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 bottom-full z-20 mb-1 w-36 overflow-hidden rounded-2xl border border-sky-100 bg-white py-1 shadow-sky-glow"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onRename(design)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-sky-900 transition hover:bg-sky-50"
                >
                  <PencilLine className="h-4 w-4" aria-hidden />
                  重命名
                </button>
                {onPublish ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onPublish(design)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-sky-900 transition hover:bg-sky-50"
                  >
                    <Send className="h-4 w-4" aria-hidden />
                    发布到社区
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(design)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error transition hover:bg-error/10"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  删除
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
