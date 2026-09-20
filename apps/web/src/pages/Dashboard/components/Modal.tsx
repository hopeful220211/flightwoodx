import { useEffect, type ReactNode } from 'react'
import { cn } from '../../../utils/cn'

/**
 * 工作台内部用的轻量弹窗外壳（删除二次确认、重命名共用）。
 *
 * 居中卡片 + 半透明遮罩；点遮罩或按 Esc 关闭。天空蓝，无土色。
 * 仅在工作台目录内使用，不进公共组件库。
 */
export interface ModalProps {
  open: boolean
  onClose: () => void
  /** 标题（弹窗顶部，加粗深蓝） */
  title: string
  children: ReactNode
  /** 底部操作区（按钮组） */
  footer: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // 弹窗打开时锁滚动，避免背景跟着滚
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-sky-900/30 backdrop-blur-sm"
      />
      {/* 卡片 */}
      <div
        className={cn(
          'relative w-full max-w-sm rounded-card border border-sky-100 bg-white p-6 shadow-sky-glow',
        )}
      >
        <h2 className="text-lg font-semibold text-sky-900">{title}</h2>
        <div className="mt-2 text-sm text-ink-600">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  )
}
