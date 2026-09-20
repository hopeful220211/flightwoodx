import { useState } from 'react'
import { Modal } from './Modal'

/**
 * 重命名作品弹窗：输入框预填当前名字，保存后回传新名字（空白则禁用保存）。
 *
 * 由父层用 key 控制每次打开都重新挂载，故初始值直接取自 `current`，无需副作用同步。
 */
export interface RenameDialogProps {
  /** 当前名字（为 null 时弹窗关闭）。 */
  current: string | null
  onCancel: () => void
  onConfirm: (name: string) => void
}

export function RenameDialog({ current, onCancel, onConfirm }: RenameDialogProps) {
  const [value, setValue] = useState(current ?? '')

  const trimmed = value.trim()
  const canSave = trimmed.length > 0

  const submit = () => {
    if (canSave) onConfirm(trimmed)
  }

  return (
    <Modal
      open={current !== null}
      onClose={onCancel}
      title="重命名作品"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[40px] items-center rounded-pill border border-sky-200 bg-white px-5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="inline-flex min-h-[40px] items-center rounded-pill bg-accent-spark px-5 text-sm font-semibold text-white transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </>
      }
    >
      <input
        autoFocus
        type="text"
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) submit()
        }}
        placeholder="给作品起个名字"
        className="site-form-control w-full rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-sky-900 outline-none transition focus:border-accent-spark focus:ring-2 focus:ring-accent-spark/30"
      />
    </Modal>
  )
}
