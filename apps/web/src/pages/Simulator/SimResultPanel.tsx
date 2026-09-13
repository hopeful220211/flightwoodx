/**
 * SimResultPanel — 仿真结束结果面板。
 *
 * 三态：完成 / 撞到障碍 / 已停止。显示用时 + 重新运行。
 * 入场动效用纯 CSS（复用 index.css 的 fadeInUp），尊重 prefers-reduced-motion。
 */
import { CheckCircle2, AlertTriangle, StopCircle, RotateCcw, type LucideIcon } from 'lucide-react'

export type SimFinishKind = 'success' | 'collision' | 'stopped' | 'error'

const ICON: Record<SimFinishKind, LucideIcon> = {
  success: CheckCircle2,
  collision: AlertTriangle,
  stopped: StopCircle,
  error: AlertTriangle,
}

const CONFIG: Record<SimFinishKind, { title: string; emoji: string; iconBg: string }> = {
  success: { title: '模拟运行完成', emoji: '', iconBg: 'bg-success/15 text-success' },
  collision: { title: '模拟中发生碰撞', emoji: '', iconBg: 'bg-error/15 text-error' },
  stopped: { title: '已停止', emoji: '⏹️', iconBg: 'bg-ink-100 text-ink-500' },
  error: { title: '运行失败', emoji: '', iconBg: 'bg-error/15 text-error' },
}

export interface SimResultPanelProps {
  kind: SimFinishKind
  elapsedSec: number
  onRerun: () => void
}

export function SimResultPanel({ kind, elapsedSec, onRerun }: SimResultPanelProps) {
  const c = CONFIG[kind]
  const Icon = ICON[kind]
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-full max-w-[260px] rounded-2xl border border-sky-100 bg-white/95 p-6 text-center shadow-lift backdrop-blur animate-[fadeInUp_220ms_ease-out] motion-reduce:animate-none">
        <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl ${c.iconBg}`}>
          <Icon size={36} aria-hidden="true" />
        </div>
        <h3 className="text-xl font-bold text-ink-900">{c.emoji} {c.title}</h3>
        <p className="mt-1 text-sm text-ink-500">用时 {elapsedSec.toFixed(1)} 秒</p>
        <button
          type="button"
          onClick={onRerun}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          <RotateCcw size={15} aria-hidden="true" /> 重新运行
        </button>
      </div>
    </div>
  )
}
