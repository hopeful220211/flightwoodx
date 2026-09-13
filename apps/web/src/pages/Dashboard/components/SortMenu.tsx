import { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, Check, ChevronDown } from 'lucide-react'
import { cn } from '../../../utils/cn'

/**
 * 工作台「排序」控件（和左侧「分组」分开：分组=看哪一类，排序=按什么顺序排）。
 *
 * 一个小下拉：最近修改（默认）/ 最早修改 / 名称 A–Z。排序对全部作品生效，不只当前一屏。
 * 以后要按更多字段排，只往 SORT_OPTIONS 加一项即可。
 */
export type SortKey = 'recent' | 'oldest' | 'name'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: '最近修改' },
  { key: 'oldest', label: '最早修改' },
  { key: 'name', label: '名称 A–Z' },
]

export interface SortMenuProps {
  value: SortKey
  onChange: (value: SortKey) => void
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部 / Esc 关闭（与卡片「⋯」菜单一致的交互）。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = SORT_OPTIONS.find((o) => o.key === value) ?? SORT_OPTIONS[0]

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`排序方式：${current.label}`}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3.5 py-1.5 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-spark"
      >
        <ArrowDownUp className="h-4 w-4 text-sky-400" aria-hidden />
        <span className="hidden text-ink-400 sm:inline">排序</span>
        <span className="font-semibold text-sky-900">{current.label}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-sky-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1.5 w-44 overflow-hidden rounded-lg border border-sky-100 bg-white py-1 shadow-sky-glow"
        >
          {SORT_OPTIONS.map((o) => {
            const active = o.key === value
            return (
              <button
                key={o.key}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(o.key)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-sm transition hover:bg-sky-50',
                  active ? 'font-semibold text-accent-spark' : 'text-sky-900',
                )}
              >
                {o.label}
                {active ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
