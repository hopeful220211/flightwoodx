import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plane } from 'lucide-react'

/** 名称可留空；拼装模式必须由用户明确选择。 */
export interface NameDroneDialogProps {
  open: boolean
  /** 确认：回传去掉首尾空格后的名字（可能为空字符串，由调用方兜底成「未命名无人机」）。 */
  onConfirm: (name: string, mode: 'guided' | 'free') => void
  onCancel: () => void
}

export function NameDroneDialog({ open, onConfirm, onCancel }: NameDroneDialogProps) {
  const [value, setValue] = useState('')
  const [mode, setMode] = useState<'guided' | 'free' | null>(null)

  // 关闭后清空输入框（在关闭路径里重置，下次打开就是空的——不依赖父层重挂载）
  const cancel = () => {
    setValue('')
    setMode(null)
    onCancel()
  }
  const submit = () => {
    if (!mode) return
    onConfirm(value.trim(), mode)
    setValue('')
    setMode(null)
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
            <h2 className="text-lg font-semibold text-sky-900">新建作品</h2>
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
          className="site-form-control mt-5 w-full rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-sky-900 outline-none transition placeholder:text-sky-300 focus:border-accent-spark focus:ring-2 focus:ring-accent-spark/30"
        />

        <fieldset className="mt-5 space-y-2">
          <legend className="mb-2 text-sm font-semibold text-ink-700">选择拼装方式</legend>
          {([
            ['guided', '按步骤拼装', '跟随步骤选择零件，逐步完成无人机。'],
            ['free', '自由拼装', '自主选择、摆放零件，并连接插接口。'],
          ] as const).map(([id, label, description]) => (
            <label key={id} className={`flex min-h-16 cursor-pointer gap-3 rounded-lg border p-3 ${mode === id ? 'border-sky-500 bg-sky-50' : 'border-ink-200 bg-white'}`}>
              <input type="radio" name="assembly-mode" value={id} checked={mode === id} onChange={() => setMode(id)} className="mt-1 accent-sky-600" />
              <span><span className="block text-sm font-semibold text-ink-800">{label}</span><span className="mt-1 block text-xs leading-relaxed text-ink-500">{description}</span></span>
            </label>
          ))}
        </fieldset>

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
            disabled={!mode}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent-spark px-6 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            开始搭建
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
