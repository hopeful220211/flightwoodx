import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plane } from 'lucide-react'

/**
 * 新建无人机第一步：先给它起个名字。
 *
 * 留空也能开始（记为「未命名无人机」），所以「开始搭建」永远可点。
 * 自包含：自带遮罩 + Esc 关闭 + 天空蓝样式，不依赖其它弹窗组件，全页无土色。
 */
export interface NameDroneDialogProps {
  open: boolean
  /** 确认：回传去掉首尾空格后的名字（可能为空字符串，由调用方兜底成「未命名无人机」）。 */
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function NameDroneDialog({ open, onConfirm, onCancel }: NameDroneDialogProps) {
  const [value, setValue] = useState('')

  // 关闭后清空输入框（在关闭路径里重置，下次打开就是空的——不依赖父层重挂载）
  const cancel = () => {
    setValue('')
    onCancel()
  }
  const submit = () => {
    onConfirm(value.trim())
    setValue('')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // cancel 只调用 onCancel + 重置本地输入，不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="给无人机起名字">
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        onClick={cancel}
        className="absolute inset-0 bg-sky-900/30 backdrop-blur-sm"
      />
      {/* 卡片 */}
      <div className="relative w-full max-w-sm rounded-card border border-sky-100 bg-white p-6 shadow-sky-glow">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-500">
            <Plane className="h-6 w-6" strokeWidth={1.6} aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold text-sky-900">设置作品名称</h2>
            <p className="mt-0.5 text-xs text-ink-500">名称用于区分作品，开始搭建后仍可修改。</p>
          </div>
        </div>

        <input
          autoFocus
          type="text"
          value={value}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) submit()
          }}
          placeholder="未命名无人机"
          aria-label="无人机名字"
          className="mt-5 w-full rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-sky-900 outline-none transition placeholder:text-sky-300 focus:border-accent-spark focus:ring-2 focus:ring-accent-spark/30"
        />

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="inline-flex min-h-[40px] items-center rounded-pill border border-sky-200 bg-white px-5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-pill bg-accent-spark px-6 text-sm font-semibold text-white shadow-sky-glow transition hover:brightness-110 active:translate-y-px"
          >
            开始搭建
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
